import { prisma } from "@/lib/prisma";
import { auditar } from "./nucleo";
import { registrarEvento } from "./eventos";
import { distanciaKm, posicoesDosTecnicos } from "./frota";
import { calcularScore, parametros, type CandidatoScore } from "./parametros";
import { STATUS_OS_ABERTOS, STATUS_TECNICO_ALOCAVEIS } from "@/lib/dominio";
import { avisarSgpDaAtribuicao } from "./sgp-notificacao";

/**
 * 4.11 — DISTRIBUIÇÃO AUTOMÁTICA DE OS.
 *
 * A operação chegou com uma regra concreta: OS de retirada de equipamento é de
 * uma pessoa só; todo o resto se reparte entre três; e quem coordena não entra
 * no rodízio. O pedido veio com nomes próprios, e é justamente por isso que
 * nenhum nome aparece neste arquivo.
 *
 * A regra vive no cadastro:
 *
 * - `Tecnico.recebeAutomatico` tira alguém do rodízio sem inativar o cadastro.
 * - `TipoOS.tecnicos` diz quem atende cada tipo. Vazio, o tipo vai para o
 *   rodízio geral. Preenchido, ele passa a ser exclusivo de quem foi designado
 *   — e quem foi designado a algum tipo sai do rodízio geral, porque virou
 *   especialista.
 *
 * Uma regra só, nos dois sentidos, e a equipe pode mudar de forma sem me
 * chamar. Férias, saída, técnico novo: é cadastro, não deploy.
 */

/**
 * Quem pode receber uma OS deste tipo.
 *
 * Devolve a lista já filtrada; se vier vazia, ninguém pode receber e a OS
 * continua sem responsável — o que é melhor do que atribuir para quem não
 * atende aquele serviço.
 */
export function elegiveisParaTipo<
  T extends { id: string; recebeAutomatico: boolean; tiposAtendidos: { valor: string }[] },
>(tecnicos: T[], tipo: string): T[] {
  const noRodizio = tecnicos.filter((t) => t.recebeAutomatico);

  const designados = noRodizio.filter((t) =>
    t.tiposAtendidos.some((x) => x.valor === tipo),
  );
  if (designados.length) return designados;

  // ninguém reivindicou este tipo: é do rodízio geral, e o especialista fica fora
  return noRodizio.filter((t) => t.tiposAtendidos.length === 0);
}

export type EscolhaDeTecnico = {
  ordemId: string;
  numero: string;
  tipo: string;
  escolhido: CandidatoScore | null;
  /** os demais avaliados, para a tela poder mostrar o segundo colocado */
  alternativas: CandidatoScore[];
  impedimento: string | null;
};

/**
 * 4.11 — escolhe o técnico de cada OS aberta e sem responsável.
 *
 * Usa o mesmo score da fila inteligente, com os pesos da Central: distância
 * quando se sabe onde o técnico está, mais carga, material em posse, região de
 * atuação e disponibilidade. A diferença para a fila é o recorte de quem pode
 * ser candidato, que aqui obedece ao cadastro de tipos.
 *
 * A carga é contada em memória e sobe a cada escolha: distribuir dez OS numa
 * rodada só, sem isso, mandaria as dez para o mesmo técnico — todas veriam a
 * mesma foto de "quem está mais livre".
 */
export async function escolherResponsaveis(
  opcoes: { ordemIds?: string[] } = {},
): Promise<EscolhaDeTecnico[]> {
  const config = await parametros();

  const ordens = await prisma.ordemServico.findMany({
    where: {
      status: { in: STATUS_OS_ABERTOS },
      tecnicoId: null,
      ...(opcoes.ordemIds ? { id: { in: opcoes.ordemIds } } : {}),
    },
    orderBy: [{ prioridade: "asc" }, { abertaEm: "asc" }],
  });
  if (!ordens.length) return [];

  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true },
    include: {
      detentor: { select: { id: true } },
      tiposAtendidos: { select: { valor: true } },
      ordens: {
        where: { status: { in: STATUS_OS_ABERTOS } },
        select: { id: true },
      },
      bairrosPrimario: { select: { id: true } },
      bairrosSecundario: { select: { id: true } },
    },
  });

  const posicoes = new Map(
    (await posicoesDosTecnicos()).map((p) => [p.tecnicoId, p]),
  );

  const saldos = await prisma.saldo.findMany({
    where: {
      detentorId: {
        in: tecnicos.map((t) => t.detentor?.id).filter(Boolean) as string[],
      },
    },
    select: { detentorId: true, materialId: true, quantidade: true, reservado: true },
  });
  const disponivelPor = new Map(
    saldos.map((s) => [`${s.detentorId}:${s.materialId}`, s.quantidade - s.reservado]),
  );

  const previstos = await prisma.materialPrevistoOS.findMany({
    where: { ordemServicoId: { in: ordens.map((o) => o.id) } },
    include: { material: { select: { nome: true } } },
  });

  // carga viva: cada atribuição desta rodada já pesa na próxima decisão
  const carga = new Map(tecnicos.map((t) => [t.id, t.ordens.length]));

  const resultados: EscolhaDeTecnico[] = [];

  for (const ordem of ordens) {
    const elegiveis = elegiveisParaTipo(tecnicos, ordem.tipo);

    if (!elegiveis.length) {
      resultados.push({
        ordemId: ordem.id,
        numero: ordem.numero,
        tipo: ordem.tipo,
        escolhido: null,
        alternativas: [],
        impedimento:
          "Nenhum técnico configurado para este tipo de OS. Ajuste em Configurações → Tipos de OS.",
      });
      continue;
    }

    const materiais = previstos.filter((m) => m.ordemServicoId === ordem.id);
    const media =
      [...carga.values()].reduce((s, n) => s + n, 0) / (carga.size || 1);

    const candidatos = elegiveis.map((tecnico) => {
      const posicao = posicoes.get(tecnico.id);
      const temCoordenada = ordem.latitude !== null && ordem.longitude !== null;

      const faltando = materiais
        .filter((material) => {
          const livre = tecnico.detentor
            ? (disponivelPor.get(`${tecnico.detentor.id}:${material.materialId}`) ?? 0)
            : 0;
          return livre < material.quantidade;
        })
        .map((m) => m.material.nome);

      const bairros = new Set([
        ...tecnico.bairrosPrimario.map((b) => b.id),
        ...tecnico.bairrosSecundario.map((b) => b.id),
      ]);

      return calcularScore(
        {
          tecnicoId: tecnico.id,
          tecnicoNome: tecnico.nome,
          referencia: posicao?.referencia ?? null,
          fonte: posicao?.fonte ?? null,
          distanciaKm:
            posicao && temCoordenada
              ? distanciaKm(posicao, {
                  latitude: ordem.latitude!,
                  longitude: ordem.longitude!,
                })
              : null,
          temMaterial: faltando.length === 0,
          faltando,
          osAbertas: carga.get(tecnico.id) ?? 0,
          mediaOsEquipe: media,
          naRegiao: ordem.bairroId ? bairros.has(ordem.bairroId) : false,
          disponivel: STATUS_TECNICO_ALOCAVEIS.includes(tecnico.status),
        },
        config,
      );
    });

    candidatos.sort((a, b) => b.score - a.score);
    const escolhido = candidatos[0] ?? null;
    if (escolhido) carga.set(escolhido.tecnicoId, (carga.get(escolhido.tecnicoId) ?? 0) + 1);

    resultados.push({
      ordemId: ordem.id,
      numero: ordem.numero,
      tipo: ordem.tipo,
      escolhido,
      alternativas: candidatos.slice(1, 3),
      impedimento: null,
    });
  }

  return resultados;
}

/**
 * Grava as escolhas.
 *
 * A OS passa a "Atribuída" porque o domínio não aceita responsável em ordem
 * "Aberta" — e porque é isso que o supervisor precisa ver no quadro. O cartão
 * continua arrastável: isto preenche o responsável, não tranca o fluxo.
 *
 * O motivo da escolha vai para a linha do tempo da OS sempre, e para a
 * auditoria quando há uma pessoa por trás da ação. Uma atribuição automática
 * sem motivo escrito é a mesma coisa que um sorteio, e ninguém consegue
 * discutir um sorteio.
 *
 * `usuarioId` vem nulo quando quem distribui é o cron da sincronização — não
 * há pessoa logada às três da manhã. A auditoria exige um responsável e por
 * isso é pulada nesse caso; a linha do tempo da OS aceita o registro sem
 * usuário, e é ela que o supervisor abre para perguntar "por que esta foi
 * para o Igor".
 */
export async function distribuir(
  usuarioId: string | null,
  opcoes: { ordemIds?: string[] } = {},
) {
  const escolhas = await escolherResponsaveis(opcoes);
  const config = await parametros();
  let atribuidas = 0;

  for (const escolha of escolhas) {
    if (!escolha.escolhido) continue;

    const ordem = await prisma.ordemServico.findUnique({
      where: { id: escolha.ordemId },
      select: { status: true, tecnicoId: true },
    });
    // alguém pode ter atribuído na mão entre o cálculo e a gravação
    if (!ordem || ordem.tecnicoId) continue;

    const status = ordem.status === "ABERTA" ? "ATRIBUIDA" : ordem.status;
    await prisma.ordemServico.update({
      where: { id: escolha.ordemId },
      data: { tecnicoId: escolha.escolhido.tecnicoId, status },
    });

    const motivo = escolha.escolhido.motivos.join(" · ");

    if (usuarioId) {
      await auditar(prisma, {
        entidade: "OrdemServico",
        entidadeId: escolha.ordemId,
        acao: "EDICAO",
        descricao: `OS ${escolha.numero} distribuída automaticamente para ${escolha.escolhido.tecnicoNome} (score ${Math.round(escolha.escolhido.score)}). ${motivo}`,
        usuarioId,
        antes: { tecnico: null, status: ordem.status },
        depois: { tecnico: escolha.escolhido.tecnicoNome, status },
      });
    }

    await registrarEvento({
      ordemServicoId: escolha.ordemId,
      tipo: "ATRIBUIDA",
      descricao: `Distribuída automaticamente para ${escolha.escolhido.tecnicoNome}. ${motivo}`,
      status,
      usuarioId,
    });

    // 2.32 — e o SGP fica sabendo, se a operação ligou isso na Central
    if (config.notificarSgp === 1) {
      await avisarSgpDaAtribuicao(escolha.ordemId, usuarioId);
    }

    atribuidas += 1;
  }

  return {
    avaliadas: escolhas.length,
    atribuidas,
    semCandidato: escolhas.filter((e) => !e.escolhido).length,
  };
}
