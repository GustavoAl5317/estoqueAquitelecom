import { prisma } from "@/lib/prisma";
import { distanciaKm, posicoesDosTecnicos } from "./frota";
import { situacaoSla } from "./ordens";
import { calcularScore, parametros, type CandidatoScore } from "./parametros";
import {
  PESO_PRIORIDADE,
  STATUS_OS_ABERTOS,
  STATUS_TECNICO_ALOCAVEIS,
} from "@/lib/dominio";

/**
 * BLOCO 4 — FILA INTELIGENTE.
 *
 * A pergunta que esta tela responde é uma só: **qual OS atacar agora e com
 * quem**. Ela cruza as três bases que os blocos anteriores construíram —
 * urgência (Bloco 2), posição (Bloco 3) e material em posse (Bloco 1) — e
 * devolve uma recomendação com o motivo escrito ao lado.
 *
 * Duas decisões de projeto valem registro:
 *
 * 1. **Nada é atribuído automaticamente.** A recomendação vira um botão, não
 *    um fato. Quem responde pela operação é o supervisor, e ele precisa poder
 *    discordar sem brigar com o sistema.
 *
 * 2. **Todo score vem acompanhado dos motivos.** Um número de 0 a 100 sozinho
 *    não sustenta uma decisão que envolve gente; a lista de motivos é o que
 *    permite conferir se o sistema está enxergando o que o supervisor enxerga.
 */

/** urgência da OS: prioridade + quanto o prazo já apertou */
function urgencia(ordem: {
  prioridade: string;
  prazo: Date | null;
  concluidaEm: Date | null;
  status: string;
  abertaEm: Date;
}) {
  const base = PESO_PRIORIDADE[ordem.prioridade] ?? 30;
  const { situacao, minutosRestantes } = situacaoSla(ordem);

  const porPrazo =
    situacao === "ESTOURADO"
      ? 80
      : situacao === "ATENCAO"
        ? 40
        : situacao === "NO_PRAZO" && minutosRestantes !== null
          ? Math.max(0, 30 - minutosRestantes / 60)
          : 0;

  // uma OS esquecida há dias sobe sozinha, mesmo sem prazo cadastrado
  const horasParada = (Date.now() - ordem.abertaEm.getTime()) / 3_600_000;
  const porEspera = Math.min(30, horasParada / 4);

  return Math.round(base + porPrazo + porEspera);
}

export type ItemDaFila = {
  ordemId: string;
  numero: string;
  cliente: string | null;
  endereco: string | null;
  bairro: string | null;
  bairroId: string | null;
  tipo: string;
  prioridade: string;
  status: string;
  abertaEm: Date;
  situacao: string;
  minutosRestantes: number | null;
  urgencia: number;
  temCoordenada: boolean;
  responsavelAtual: { id: string; nome: string } | null;
  /** materiais previstos que precisam estar com o técnico */
  materiais: { materialId: string; nome: string; quantidade: number }[];
  /** 4.7 — os três melhores candidatos, com o porquê */
  candidatos: CandidatoScore[];
  /** por que não há candidato, quando não há */
  impedimento: string | null;
};

/**
 * 4.3 / 4.7 — a fila.
 *
 * Ordena as OS abertas por urgência e, para cada uma, ranqueia os técnicos
 * disponíveis com o score configurado na Central de Controle.
 */
export async function filaInteligente(
  opcoes: { limite?: number; somenteSemResponsavel?: boolean } = {},
): Promise<ItemDaFila[]> {
  const config = await parametros();

  const ordens = await prisma.ordemServico.findMany({
    where: {
      status: { in: STATUS_OS_ABERTOS },
      ...(opcoes.somenteSemResponsavel ? { tecnicoId: null } : {}),
    },
    include: {
      tecnico: { select: { id: true, nome: true } },
      bairro: { select: { id: true, nome: true } },
      materiaisPrevistos: { include: { material: { select: { nome: true } } } },
    },
  });

  if (!ordens.length) return [];

  // --- contexto compartilhado, buscado uma vez só -------------------------
  //
  // A posição vem do celular do técnico quando existe, e do carro dele quando
  // não — a escolha fica em posicoesDosTecnicos, e aqui só se consome.
  const posicoes = await posicoesDosTecnicos();

  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true },
    include: {
      detentor: { select: { id: true } },
      ordens: {
        where: { status: { in: STATUS_OS_ABERTOS } },
        select: { id: true },
      },
      bairrosPrimario: { select: { id: true } },
      bairrosSecundario: { select: { id: true } },
    },
  });

  const mediaCarga = tecnicos.length
    ? tecnicos.reduce((s, t) => s + t.ordens.length, 0) / tecnicos.length
    : 0;

  const detentores = tecnicos.map((t) => t.detentor?.id).filter(Boolean) as string[];
  const saldos = detentores.length
    ? await prisma.saldo.findMany({
        where: { detentorId: { in: detentores } },
        select: {
          detentorId: true,
          materialId: true,
          quantidade: true,
          reservado: true,
        },
      })
    : [];

  const disponivelPor = new Map<string, number>();
  for (const saldo of saldos) {
    disponivelPor.set(
      `${saldo.detentorId}:${saldo.materialId}`,
      saldo.quantidade - saldo.reservado,
    );
  }

  const posicaoPor = new Map(posicoes.map((p) => [p.tecnicoId, p]));

  // --- monta a fila --------------------------------------------------------
  const itens: ItemDaFila[] = [];

  for (const ordem of ordens) {
    const { situacao, minutosRestantes } = situacaoSla(ordem);
    const materiais = ordem.materiaisPrevistos.map((m) => ({
      materialId: m.materialId,
      nome: m.material.nome,
      quantidade: m.quantidade,
    }));

    const temCoordenada = ordem.latitude !== null && ordem.longitude !== null;
    const candidatos: CandidatoScore[] = [];
    let impedimento: string | null = null;

    {
      /**
       * 4.11 — a falta de posição deixou de eliminar o candidato.
       *
       * Antes, técnico sem aparecer no mapa era descartado e OS sem coordenada
       * não era ranqueada. Numa operação em que os celulares ainda não foram
       * classificados na Central, isso descartava todo mundo em toda OS: a
       * tela dizia "nenhum técnico com posição conhecida" e não recomendava
       * ninguém — que foi como a fila parou de servir para o que existe.
       *
       * Agora a distância é um critério a mais, não a porta de entrada. Sem
       * ela, carga, material, região e disponibilidade decidem; com ela, o
       * ranking fica melhor. O motivo escrito ao lado avisa qual dos dois
       * casos produziu aquela recomendação.
       */
      for (const tecnico of tecnicos) {
        const posicao = posicaoPor.get(tecnico.id);

        const faltando: string[] = [];
        for (const material of materiais) {
          const livre = tecnico.detentor
            ? (disponivelPor.get(`${tecnico.detentor.id}:${material.materialId}`) ?? 0)
            : 0;
          if (livre < material.quantidade) faltando.push(material.nome);
        }

        const bairrosDele = new Set([
          ...tecnico.bairrosPrimario.map((b) => b.id),
          ...tecnico.bairrosSecundario.map((b) => b.id),
        ]);

        candidatos.push(
          calcularScore(
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
              osAbertas: tecnico.ordens.length,
              mediaOsEquipe: mediaCarga,
              naRegiao: ordem.bairroId ? bairrosDele.has(ordem.bairroId) : false,
              disponivel: STATUS_TECNICO_ALOCAVEIS.includes(tecnico.status),
            },
            config,
          ),
        );
      }

      if (!candidatos.length) {
        impedimento = "Nenhum técnico ativo cadastrado para receber esta OS.";
      } else if (!temCoordenada) {
        // não impede a recomendação; avisa que ela saiu sem o critério de distância
        impedimento =
          "OS sem coordenada — a recomendação saiu por carga, material e região.";
      }
    }

    candidatos.sort((a, b) => b.score - a.score);

    itens.push({
      ordemId: ordem.id,
      numero: ordem.numero,
      cliente: ordem.cliente,
      endereco: ordem.endereco,
      bairro: ordem.bairro?.nome ?? ordem.bairroNome,
      bairroId: ordem.bairroId,
      tipo: ordem.tipo,
      prioridade: ordem.prioridade,
      status: ordem.status,
      abertaEm: ordem.abertaEm,
      situacao,
      minutosRestantes,
      urgencia: urgencia(ordem),
      temCoordenada,
      responsavelAtual: ordem.tecnico,
      materiais,
      candidatos: candidatos.slice(0, 3),
      impedimento,
    });
  }

  itens.sort((a, b) => b.urgencia - a.urgencia);
  return opcoes.limite ? itens.slice(0, opcoes.limite) : itens;
}

/**
 * 4.10 — leitura da operação em uma frase.
 *
 * Um painel cheio de números exige alguém que saiba lê-los. Esta função escreve
 * o que os números estão dizendo, para quem só passou os olhos.
 */
export async function leituraDaOperacao() {
  const fila = await filaInteligente({ limite: 200 });

  const semResponsavel = fila.filter((i) => !i.responsavelAtual);
  const estouradas = fila.filter((i) => i.situacao === "ESTOURADO");
  const semMaterial = fila.filter(
    (i) => i.candidatos.length > 0 && i.candidatos.every((c) => !c.temMaterial),
  );
  const semCoordenada = fila.filter((i) => !i.temCoordenada);

  const frases: { tom: "critico" | "atencao" | "informativo" | "positivo"; texto: string }[] =
    [];

  if (estouradas.length) {
    frases.push({
      tom: "critico",
      texto: `${estouradas.length} ${estouradas.length === 1 ? "OS já estourou" : "OS já estouraram"} o prazo. A mais antiga é a ${estouradas[0].numero}.`,
    });
  }

  if (semResponsavel.length) {
    frases.push({
      tom: "atencao",
      texto: `${semResponsavel.length} ${semResponsavel.length === 1 ? "OS está" : "OS estão"} sem responsável — ${
        semResponsavel.filter((i) => i.candidatos.length).length
      } já têm técnico recomendado aqui na fila.`,
    });
  }

  if (semMaterial.length) {
    const faltas = new Map<string, number>();
    for (const item of semMaterial) {
      for (const nome of item.candidatos[0]?.faltando ?? []) {
        faltas.set(nome, (faltas.get(nome) ?? 0) + 1);
      }
    }
    const maisFalta = [...faltas.entries()].sort((a, b) => b[1] - a[1])[0];
    frases.push({
      tom: "atencao",
      texto: `${semMaterial.length} ${semMaterial.length === 1 ? "OS depende" : "OS dependem"} de material que nenhum técnico próximo tem em posse${
        maisFalta ? ` — o item mais crítico é ${maisFalta[0]}` : ""
      }.`,
    });
  }

  if (semCoordenada.length) {
    frases.push({
      tom: "informativo",
      texto: `${semCoordenada.length} ${semCoordenada.length === 1 ? "OS está" : "OS estão"} sem coordenada e ficam fora da recomendação até alguém informar o endereço.`,
    });
  }

  if (!frases.length) {
    frases.push({
      tom: "positivo",
      texto: fila.length
        ? "Todas as OS abertas têm responsável, prazo folgado e material disponível."
        : "Nenhuma OS aberta no momento.",
    });
  }

  return { frases, total: fila.length };
}
