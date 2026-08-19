import { prisma } from "@/lib/prisma";
import { auditar, ErroDeNegocio, type Tx } from "./nucleo";
import { registrarEvento } from "./eventos";
import { fecharPermanencia } from "./geofence";
import {
  COLUNAS_QUADRO,
  STATUS_OS,
  STATUS_OS_ABERTOS,
  STATUS_OS_ENCERRADOS,
  STATUS_OS_EXIGEM_TECNICO,
  TIPO_OS,
} from "@/lib/dominio";

/**
 * VÍNCULO LEVE COM ORDEM DE SERVIÇO.
 *
 * O estoque não sincroniza com o SGP. Da OS guardamos apenas o mínimo para
 * responder "o que foi usado nesta OS": número, cliente e os materiais que
 * saíram. Tudo o mais continua vivendo no SGP.
 *
 * A estrutura completa da OS permanece no schema para quando o Bloco 2 for
 * construído — só que aqui nenhum desses campos é exigido.
 */
export async function vincularOrdemServico(
  tx: Tx,
  dados: { numero: string; cliente?: string | null; codigoCliente?: string | null },
) {
  const numero = dados.numero.trim();
  if (!numero) throw new ErroDeNegocio("Informe o número da OS.");

  const existente = await tx.ordemServico.findUnique({ where: { numero } });

  if (existente) {
    // completa o nome do cliente quando ele só foi informado depois
    if (dados.cliente && !existente.cliente) {
      return tx.ordemServico.update({
        where: { id: existente.id },
        data: { cliente: dados.cliente.trim() },
      });
    }
    return existente;
  }

  return tx.ordemServico.create({
    data: {
      numero,
      idSgp: numero,
      tipo: "NAO_INFORMADO",
      cliente: dados.cliente?.trim() || null,
      codigoCliente: dados.codigoCliente?.trim() || null,
      origem: "LANCAMENTO_MANUAL",
      status: "ABERTA",
    },
  });
}

/** 1.34 — material que saiu do estoque por conta de uma OS. */
export async function materiaisDaOrdem(ordemServicoId: string) {
  const movimentacoes = await prisma.movimentacao.findMany({
    where: { ordemServicoId },
    include: {
      origem: true,
      destino: true,
      responsavel: { select: { nome: true } },
      itens: {
        include: {
          material: true,
          seriais: { include: { unidade: true } },
        },
      },
    },
    orderBy: { criadoEm: "asc" },
  });

  const consolidado = new Map<
    string,
    {
      materialId: string;
      nome: string;
      unidadeMedida: string;
      usado: number;
      devolvido: number;
      valor: number;
      seriais: string[];
    }
  >();

  for (const movimentacao of movimentacoes) {
    for (const item of movimentacao.itens) {
      const atual = consolidado.get(item.materialId) ?? {
        materialId: item.materialId,
        nome: item.material.nome,
        unidadeMedida: item.material.unidadeMedida,
        usado: 0,
        devolvido: 0,
        valor: 0,
        seriais: [],
      };

      if (movimentacao.tipo === "DEVOLUCAO") {
        atual.devolvido += item.quantidade;
      } else {
        atual.usado += item.quantidade;
        atual.valor +=
          item.quantidade * (item.valorUnitario ?? item.material.valorMedio);
      }

      for (const vinculo of item.seriais) {
        if (!atual.seriais.includes(vinculo.unidade.serial)) {
          atual.seriais.push(vinculo.unidade.serial);
        }
      }

      consolidado.set(item.materialId, atual);
    }
  }

  return {
    movimentacoes,
    consolidado: [...consolidado.values()].sort((a, b) =>
      a.nome.localeCompare(b.nome),
    ),
    valorTotal: [...consolidado.values()].reduce((s, i) => s + i.valor, 0),
  };
}

export async function listarOrdensComMaterial(limite = 100) {
  const ordens = await prisma.ordemServico.findMany({
    where: { movimentacoes: { some: {} } },
    include: {
      tecnico: true,
      movimentacoes: {
        include: { itens: { include: { material: true } } },
      },
    },
    orderBy: { abertaEm: "desc" },
    take: limite,
  });

  return ordens.map((ordem) => {
    const itens = ordem.movimentacoes.flatMap((m) =>
      m.itens.map((item) => ({
        nome: item.material.nome,
        quantidade: m.tipo === "DEVOLUCAO" ? -item.quantidade : item.quantidade,
        valor:
          (m.tipo === "DEVOLUCAO" ? 0 : item.quantidade) *
          (item.valorUnitario ?? item.material.valorMedio),
      })),
    );

    return {
      id: ordem.id,
      numero: ordem.numero,
      cliente: ordem.cliente,
      status: ordem.status,
      abertaEm: ordem.abertaEm,
      tecnico: ordem.tecnico?.nome ?? null,
      movimentacoes: ordem.movimentacoes.length,
      totalItens: itens.reduce((s, i) => s + i.quantidade, 0),
      valor: itens.reduce((s, i) => s + i.valor, 0),
      resumo: [...new Set(itens.map((i) => i.nome))].slice(0, 4).join(", "),
    };
  });
}

// ---------------------------------------------------------------------------
// BLOCO 2 — gestão da ordem de serviço
//
// O SGP continua sendo o sistema de origem. O que existe aqui é a camada
// operacional: quem vai atender, em que pé está, e quanto tempo falta. Uma OS
// pode nascer de três formas — importada do SGP, digitada na Central, ou criada
// sozinha quando alguém lança material informando um número novo.
// ---------------------------------------------------------------------------

/**
 * 2.28 — situação do prazo.
 *
 * Separado em função pura porque a mesma regra vale para a lista, para o quadro
 * e para o relatório, e porque prazo é o tipo de conta que ninguém quer ver
 * escrita de três jeitos diferentes.
 */
export function situacaoSla(ordem: {
  prazo: Date | null;
  concluidaEm: Date | null;
  status: string;
}) {
  if (!ordem.prazo) {
    return { situacao: "SEM_PRAZO" as const, minutosRestantes: null };
  }

  const referencia = ordem.concluidaEm ?? new Date();
  const minutos = Math.round(
    (ordem.prazo.getTime() - referencia.getTime()) / 60_000,
  );

  if (ordem.concluidaEm) {
    return {
      situacao:
        minutos >= 0
          ? ("CONCLUIDA_NO_PRAZO" as const)
          : ("CONCLUIDA_ATRASADA" as const),
      minutosRestantes: minutos,
    };
  }

  if (minutos < 0) return { situacao: "ESTOURADO" as const, minutosRestantes: minutos };
  if (minutos <= 60) return { situacao: "ATENCAO" as const, minutosRestantes: minutos };
  return { situacao: "NO_PRAZO" as const, minutosRestantes: minutos };
}

/** "2h 15min" / "atrasada 40min" — o formato que cabe num cartão do quadro */
export function prazoLegivel(minutos: number | null) {
  if (minutos === null) return "sem prazo";
  const abs = Math.abs(minutos);
  const horas = Math.floor(abs / 60);
  const resto = abs % 60;
  const texto = horas ? `${horas}h${resto ? ` ${resto}min` : ""}` : `${resto}min`;
  return minutos < 0 ? `atrasada ${texto}` : texto;
}

export type FiltroOrdens = {
  status?: string[];
  tecnicoId?: string;
  equipeId?: string;
  bairroId?: string;
  prioridade?: string;
  tipo?: string;
  busca?: string;
  /** só as que estouraram ou estão perto de estourar o prazo */
  somenteRisco?: boolean;
  limite?: number;
};

const INCLUSAO_PADRAO = {
  tecnico: { select: { id: true, nome: true, status: true } },
  equipe: { select: { id: true, nome: true } },
  bairro: { select: { id: true, nome: true, cidade: true, regiaoId: true } },
  materiaisPrevistos: { include: { material: true } },
  _count: { select: { movimentacoes: true } },
} as const;

export type OrdemDaLista = Awaited<ReturnType<typeof listarOrdens>>[number];

/** 2.4 / 2.15 — a lista com os filtros que a operação usa todo dia. */
export async function listarOrdens(filtro: FiltroOrdens = {}) {
  const busca = filtro.busca?.trim();

  const ordens = await prisma.ordemServico.findMany({
    where: {
      status: filtro.status?.length ? { in: filtro.status } : undefined,
      tecnicoId: filtro.tecnicoId || undefined,
      equipeId: filtro.equipeId || undefined,
      bairroId: filtro.bairroId || undefined,
      prioridade: filtro.prioridade || undefined,
      tipo: filtro.tipo || undefined,
      ...(busca
        ? {
            OR: [
              { numero: { contains: busca } },
              { cliente: { contains: busca } },
              { endereco: { contains: busca } },
              { contrato: { contains: busca } },
              { titulo: { contains: busca } },
            ],
          }
        : {}),
    },
    include: INCLUSAO_PADRAO,
    orderBy: [{ prioridade: "asc" }, { abertaEm: "asc" }],
    take: filtro.limite ?? 300,
  });

  const comSla = ordens.map((ordem) => ({ ...ordem, ...situacaoSla(ordem) }));

  return filtro.somenteRisco
    ? comSla.filter((o) => o.situacao === "ESTOURADO" || o.situacao === "ATENCAO")
    : comSla;
}

export async function detalheOrdem(id: string) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id },
    include: {
      ...INCLUSAO_PADRAO,
      reservas: { include: { material: true } },
      movimentacoes: {
        include: {
          origem: true,
          destino: true,
          responsavel: { select: { nome: true } },
          itens: {
            include: { material: true, seriais: { include: { unidade: true } } },
          },
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });

  if (!ordem) return null;
  return { ...ordem, ...situacaoSla(ordem) };
}

function calcularPrazo(sla: number | null, abertaEm: Date, prazo?: Date | null) {
  if (prazo) return prazo;
  if (sla && sla > 0) return new Date(abertaEm.getTime() + sla * 60_000);
  return null;
}

export type DadosOrdem = {
  numero: string;
  tipo: string;
  titulo?: string | null;
  descricao?: string | null;
  cliente?: string | null;
  contrato?: string | null;
  codigoCliente?: string | null;
  endereco?: string | null;
  bairroId?: string | null;
  cidade?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  prioridade?: string;
  severidade?: string;
  /** prazo em minutos contados da abertura */
  sla?: number | null;
  agendadaPara?: Date | null;
  tecnicoId?: string | null;
  equipeId?: string | null;
};

/** 2.1 — criação manual, para o que não vem do SGP. */
export async function criarOrdem(dados: DadosOrdem, usuarioId: string) {
  const numero = dados.numero.trim();
  if (!numero) throw new ErroDeNegocio("Informe o número da OS.");
  if (!TIPO_OS.inclui(dados.tipo)) throw new ErroDeNegocio("Tipo de OS inválido.");

  const existente = await prisma.ordemServico.findUnique({ where: { numero } });
  if (existente) throw new ErroDeNegocio(`A OS ${numero} já existe.`);

  const abertaEm = new Date();
  const bairro = dados.bairroId
    ? await prisma.bairro.findUnique({ where: { id: dados.bairroId } })
    : null;

  const ordem = await prisma.ordemServico.create({
    data: {
      numero,
      tipo: dados.tipo,
      titulo: dados.titulo?.trim() || null,
      descricao: dados.descricao?.trim() || null,
      cliente: dados.cliente?.trim() || null,
      contrato: dados.contrato?.trim() || null,
      codigoCliente: dados.codigoCliente?.trim() || null,
      endereco: dados.endereco?.trim() || null,
      bairroId: bairro?.id ?? null,
      bairroNome: bairro?.nome ?? null,
      cidade: dados.cidade?.trim() || bairro?.cidade || null,
      latitude: dados.latitude ?? null,
      longitude: dados.longitude ?? null,
      prioridade: dados.prioridade ?? "P3",
      severidade: dados.severidade ?? "MEDIA",
      sla: dados.sla ?? null,
      prazo: calcularPrazo(dados.sla ?? null, abertaEm),
      agendadaPara: dados.agendadaPara ?? null,
      abertaEm,
      origem: "CENTRAL",
      status: dados.tecnicoId ? "ATRIBUIDA" : "ABERTA",
      tecnicoId: dados.tecnicoId || null,
      equipeId: dados.equipeId || bairro?.equipeId || null,
    },
  });

  await auditar(prisma, {
    entidade: "OrdemServico",
    entidadeId: ordem.id,
    acao: "CRIACAO",
    descricao: `OS ${numero} criada na Central.`,
    usuarioId,
    depois: { numero, tipo: dados.tipo, cliente: dados.cliente ?? null },
  });

  // 2.33 — a timeline começa no nascimento da OS, não na primeira mudança
  await registrarEvento({
    ordemServicoId: ordem.id,
    tipo: "RECEBIDA",
    descricao: `OS registrada na Central como ${TIPO_OS.rotulo(dados.tipo).toLowerCase()}.`,
    status: ordem.status,
    usuarioId,
    ocorreuEm: ordem.abertaEm,
  });

  return ordem;
}

export async function atualizarOrdem(
  id: string,
  dados: Partial<DadosOrdem>,
  usuarioId: string,
) {
  const antes = await prisma.ordemServico.findUnique({ where: { id } });
  if (!antes) throw new ErroDeNegocio("Ordem de serviço não encontrada.");

  const bairro = dados.bairroId
    ? await prisma.bairro.findUnique({ where: { id: dados.bairroId } })
    : null;

  const sla = dados.sla === undefined ? antes.sla : dados.sla;

  const ordem = await prisma.ordemServico.update({
    where: { id },
    data: {
      tipo: dados.tipo ?? antes.tipo,
      titulo: dados.titulo?.trim() ?? antes.titulo,
      descricao: dados.descricao?.trim() ?? antes.descricao,
      cliente: dados.cliente?.trim() ?? antes.cliente,
      contrato: dados.contrato?.trim() ?? antes.contrato,
      endereco: dados.endereco?.trim() ?? antes.endereco,
      bairroId: dados.bairroId === undefined ? antes.bairroId : (bairro?.id ?? null),
      bairroNome: bairro ? bairro.nome : antes.bairroNome,
      cidade: dados.cidade?.trim() ?? antes.cidade,
      latitude: dados.latitude ?? antes.latitude,
      longitude: dados.longitude ?? antes.longitude,
      prioridade: dados.prioridade ?? antes.prioridade,
      severidade: dados.severidade ?? antes.severidade,
      sla,
      prazo: calcularPrazo(sla, antes.abertaEm, dados.agendadaPara ?? antes.prazo),
      agendadaPara: dados.agendadaPara ?? antes.agendadaPara,
    },
  });

  await auditar(prisma, {
    entidade: "OrdemServico",
    entidadeId: id,
    acao: "EDICAO",
    descricao: `OS ${antes.numero} editada.`,
    usuarioId,
    antes: { prioridade: antes.prioridade, tipo: antes.tipo, prazo: antes.prazo },
    depois: { prioridade: ordem.prioridade, tipo: ordem.tipo, prazo: ordem.prazo },
  });

  return ordem;
}

/**
 * 2.22 / 3.44 — atribuir ou trocar o responsável.
 *
 * Atribuir também avança o status: uma OS com dono não pode continuar aberta,
 * ou o quadro passa a mentir.
 */
export async function atribuirOrdem(
  dados: { ordemId: string; tecnicoId: string | null; observacao?: string | null },
  usuarioId: string,
) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: dados.ordemId },
    include: { tecnico: true },
  });
  if (!ordem) throw new ErroDeNegocio("Ordem de serviço não encontrada.");
  if (STATUS_OS_ENCERRADOS.includes(ordem.status)) {
    throw new ErroDeNegocio(
      `A OS ${ordem.numero} está ${STATUS_OS.rotulo(ordem.status).toLowerCase()} e não aceita novo responsável.`,
    );
  }

  let tecnico = null;
  if (dados.tecnicoId) {
    tecnico = await prisma.tecnico.findUnique({ where: { id: dados.tecnicoId } });
    if (!tecnico) throw new ErroDeNegocio("Técnico não encontrado.");
    if (!tecnico.ativo) throw new ErroDeNegocio(`${tecnico.nome} está inativo.`);
  }

  const atualizada = await prisma.ordemServico.update({
    where: { id: ordem.id },
    data: {
      tecnicoId: tecnico?.id ?? null,
      equipeId: tecnico?.equipeId ?? ordem.equipeId,
      status: tecnico
        ? STATUS_OS_EXIGEM_TECNICO.includes(ordem.status)
          ? ordem.status
          : "ATRIBUIDA"
        : "ABERTA",
    },
  });

  await auditar(prisma, {
    entidade: "OrdemServico",
    entidadeId: ordem.id,
    acao: "EDICAO",
    descricao: `OS ${ordem.numero}: ${ordem.tecnico?.nome ?? "sem responsável"} → ${
      tecnico?.nome ?? "sem responsável"
    }.${dados.observacao ? ` ${dados.observacao}` : ""}`,
    usuarioId,
    antes: { tecnico: ordem.tecnico?.nome ?? null, status: ordem.status },
    depois: { tecnico: tecnico?.nome ?? null, status: atualizada.status },
  });

  await registrarEvento({
    ordemServicoId: ordem.id,
    tipo: "ATRIBUIDA",
    descricao: tecnico
      ? `Atribuída a ${tecnico.nome}.`
      : "Responsável removido — voltou para a fila.",
    status: atualizada.status,
    usuarioId,
  });

  return atualizada;
}

/**
 * 2.20 — mover a OS de coluna.
 *
 * As transições são livres de propósito: a realidade de campo raramente segue o
 * fluxo desenhado, e travar o quadro só faria o supervisor registrar errado. O
 * que o sistema garante é que nada avança sem responsável e que a conclusão
 * carimba a data.
 */
export async function moverOrdem(
  dados: { ordemId: string; status: string; motivo?: string | null },
  usuarioId: string,
) {
  if (!STATUS_OS.inclui(dados.status)) throw new ErroDeNegocio("Status inválido.");

  const ordem = await prisma.ordemServico.findUnique({
    where: { id: dados.ordemId },
  });
  if (!ordem) throw new ErroDeNegocio("Ordem de serviço não encontrada.");
  if (ordem.status === dados.status) return ordem;

  if (STATUS_OS_EXIGEM_TECNICO.includes(dados.status) && !ordem.tecnicoId) {
    throw new ErroDeNegocio(
      `Atribua um técnico antes de mover a OS ${ordem.numero} para ${STATUS_OS.rotulo(
        dados.status,
      ).toLowerCase()}.`,
    );
  }

  const atualizada = await prisma.ordemServico.update({
    where: { id: ordem.id },
    data: {
      status: dados.status,
      concluidaEm:
        dados.status === "CONCLUIDA"
          ? (ordem.concluidaEm ?? new Date())
          : dados.status === "CANCELADA"
            ? ordem.concluidaEm
            : null,
    },
  });

  // 3.36 — encerrada a OS, a permanência no local também se encerra
  if (STATUS_OS_ENCERRADOS.includes(dados.status)) {
    await fecharPermanencia(ordem.id, atualizada.concluidaEm ?? new Date());
  }

  // 3.11 — o status do técnico acompanha o da OS enquanto ele está nela
  const espelho: Record<string, string> = {
    EM_DESLOCAMENTO: "EM_DESLOCAMENTO",
    EM_ATENDIMENTO: "EM_ATENDIMENTO",
    PENDENTE: "AGUARDANDO_CLIENTE",
    CONCLUIDA: "DISPONIVEL",
    CANCELADA: "DISPONIVEL",
  };
  if (ordem.tecnicoId && espelho[dados.status]) {
    await prisma.tecnico.update({
      where: { id: ordem.tecnicoId },
      data: { status: espelho[dados.status] },
    });
  }

  await auditar(prisma, {
    entidade: "OrdemServico",
    entidadeId: ordem.id,
    acao: "EDICAO",
    descricao: `OS ${ordem.numero}: ${STATUS_OS.rotulo(ordem.status)} → ${STATUS_OS.rotulo(
      dados.status,
    )}.${dados.motivo ? ` Motivo: ${dados.motivo}` : ""}`,
    usuarioId,
    antes: { status: ordem.status },
    depois: { status: dados.status },
  });

  await registrarEvento({
    ordemServicoId: ordem.id,
    tipo: "STATUS",
    descricao: `${STATUS_OS.rotulo(ordem.status)} → ${STATUS_OS.rotulo(dados.status)}${
      dados.motivo ? `. ${dados.motivo}` : ""
    }`,
    status: dados.status,
    usuarioId,
  });

  return atualizada;
}

/**
 * 2.20 — as colunas do quadro, já com contagem e SLA de cada cartão.
 *
 * A coluna de concluídas mostra só as últimas horas. Sem esse corte ela cresce
 * para sempre e, em um mês, o quadro vira um arquivo morto com uma faixa de
 * trabalho ativo espremida à esquerda. O total continua visível no cabeçalho —
 * o que some é o cartão, não o número.
 */
function montarColunas(ordens: OrdemDaLista[], corte: Date) {
  return COLUNAS_QUADRO.map((status) => {
    const daColuna = ordens.filter((o) => o.status === status);

    const cartoes =
      status === "CONCLUIDA"
        ? daColuna.filter((o) => !o.concluidaEm || o.concluidaEm >= corte)
        : daColuna;

    return {
      status,
      rotulo: STATUS_OS.rotulo(status),
      total: daColuna.length,
      /** quantas ficaram de fora do quadro por serem antigas demais */
      ocultas: daColuna.length - cartoes.length,
      emRisco: cartoes.filter(
        (c) => c.situacao === "ESTOURADO" || c.situacao === "ATENCAO",
      ).length,
      cartoes,
    };
  });
}

export async function quadroDeOrdens(
  filtro: FiltroOrdens = {},
  horasConcluidas = 24,
) {
  const ordens = await listarOrdens({ ...filtro, limite: 400 });
  return montarColunas(ordens, new Date(Date.now() - horasConcluidas * 3_600_000));
}

export const RECORTES_QUADRO = ["STATUS", "TECNICO", "EQUIPE", "BAIRRO"] as const;
export type RecorteQuadro = (typeof RECORTES_QUADRO)[number];

export type FaixaDoQuadro = {
  /** id do técnico, da equipe ou do bairro; vazio na faixa dos sem vínculo */
  chave: string;
  rotulo: string;
  detalhe: string | null;
  total: number;
  emRisco: number;
  colunas: ReturnType<typeof montarColunas>;
};

/**
 * 3.25 / 3.26 / 3.27 — O QUADRO CORTADO POR RESPONSÁVEL, EQUIPE OU BAIRRO.
 *
 * Um quadro só, com filtro, responde "como está a operação". Ele não responde
 * "quem está afogado" — para isso é preciso ver as pessoas lado a lado, cada
 * uma com o próprio fluxo. O recorte não muda o que existe: é a mesma consulta,
 * cortada em faixas.
 *
 * Quem não tem responsável, equipe ou bairro cai numa faixa própria, sempre a
 * última. Esconder essas OS seria esconder justamente as que precisam de
 * decisão.
 */
export async function quadroPorRecorte(
  filtro: FiltroOrdens = {},
  recorte: RecorteQuadro = "STATUS",
  horasConcluidas = 24,
): Promise<FaixaDoQuadro[]> {
  const ordens = await listarOrdens({ ...filtro, limite: 400 });
  const corte = new Date(Date.now() - horasConcluidas * 3_600_000);

  const faixaInteira = (): FaixaDoQuadro => {
    const colunas = montarColunas(ordens, corte);
    return {
      chave: "",
      rotulo: "Todas as ordens",
      detalhe: null,
      total: ordens.length,
      emRisco: colunas.reduce((s, c) => s + c.emRisco, 0),
      colunas,
    };
  };

  if (recorte === "STATUS") return [faixaInteira()];

  const identificar = (ordem: OrdemDaLista) => {
    if (recorte === "TECNICO") {
      return {
        chave: ordem.tecnicoId ?? "",
        rotulo: ordem.tecnico?.nome ?? "Sem responsável",
        detalhe: ordem.equipe?.nome ?? null,
      };
    }
    if (recorte === "EQUIPE") {
      return {
        chave: ordem.equipeId ?? "",
        rotulo: ordem.equipe?.nome ?? "Sem equipe",
        detalhe: null,
      };
    }
    // o bairro pode vir do cadastro ou só como nome copiado do SGP
    const nome = ordem.bairro?.nome ?? ordem.bairroNome;
    return {
      chave: ordem.bairroId ?? (nome ? `nome:${nome}` : ""),
      rotulo: nome ?? "Sem bairro",
      detalhe: ordem.bairro?.cidade ?? ordem.cidade,
    };
  };

  const grupos = new Map<
    string,
    { rotulo: string; detalhe: string | null; ordens: OrdemDaLista[] }
  >();

  for (const ordem of ordens) {
    const { chave, rotulo, detalhe } = identificar(ordem);
    const grupo = grupos.get(chave) ?? { rotulo, detalhe, ordens: [] };
    grupo.ordens.push(ordem);
    grupos.set(chave, grupo);
  }

  const faixas = [...grupos.entries()].map(([chave, grupo]) => {
    const colunas = montarColunas(grupo.ordens, corte);
    return {
      chave,
      rotulo: grupo.rotulo,
      detalhe: grupo.detalhe,
      total: grupo.ordens.length,
      emRisco: colunas.reduce((s, c) => s + c.emRisco, 0),
      colunas,
    };
  });

  // sem vínculo por último: é fila de decisão, não de acompanhamento
  return faixas.sort((a, b) => {
    if (!a.chave) return 1;
    if (!b.chave) return -1;
    return a.rotulo.localeCompare(b.rotulo);
  });
}

/** 2.30 / 4.1 — números do topo da tela de OS. */
export async function indicadoresOrdens() {
  const ordens = await prisma.ordemServico.findMany({
    select: {
      status: true,
      prioridade: true,
      prazo: true,
      concluidaEm: true,
      tecnicoId: true,
      abertaEm: true,
    },
  });

  const abertas = ordens.filter((o) => STATUS_OS_ABERTOS.includes(o.status));
  const concluidas = ordens.filter((o) => o.status === "CONCLUIDA");

  const emRisco = abertas.filter((o) => {
    const { situacao } = situacaoSla(o);
    return situacao === "ESTOURADO" || situacao === "ATENCAO";
  });

  const duracoes = concluidas
    .filter((o) => o.concluidaEm)
    .map((o) => (o.concluidaEm!.getTime() - o.abertaEm.getTime()) / 3_600_000);

  const noPrazo = concluidas.filter(
    (o) => situacaoSla(o).situacao === "CONCLUIDA_NO_PRAZO",
  ).length;
  const comPrazo = concluidas.filter((o) => o.prazo).length;

  return {
    abertas: abertas.length,
    semResponsavel: abertas.filter((o) => !o.tecnicoId).length,
    emRisco: emRisco.length,
    emergenciais: abertas.filter((o) => o.prioridade === "P1").length,
    concluidas: concluidas.length,
    horasMedias: duracoes.length
      ? duracoes.reduce((s, d) => s + d, 0) / duracoes.length
      : 0,
    aderenciaSla: comPrazo ? Math.round((noPrazo / comPrazo) * 100) : null,
  };
}

/** 2.34 — quanto cada técnico está carregando agora. */
export async function cargaPorTecnico() {
  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true },
    include: {
      equipe: { select: { nome: true } },
      ordens: {
        where: { status: { in: STATUS_OS_ABERTOS } },
        select: {
          id: true,
          prioridade: true,
          prazo: true,
          concluidaEm: true,
          status: true,
        },
      },
    },
    orderBy: { nome: "asc" },
  });

  const linhas = tecnicos.map((tecnico) => ({
    id: tecnico.id,
    nome: tecnico.nome,
    matricula: tecnico.matricula,
    status: tecnico.status,
    equipe: tecnico.equipe?.nome ?? null,
    abertas: tecnico.ordens.length,
    emergenciais: tecnico.ordens.filter((o) => o.prioridade === "P1").length,
    emRisco: tecnico.ordens.filter((o) => {
      const { situacao } = situacaoSla(o);
      return situacao === "ESTOURADO" || situacao === "ATENCAO";
    }).length,
  }));

  const media = linhas.length
    ? linhas.reduce((s, l) => s + l.abertas, 0) / linhas.length
    : 0;

  return { linhas, media };
}
