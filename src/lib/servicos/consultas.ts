import { prisma } from "@/lib/prisma";
import {
  MOVIMENTOS_DE_CONSUMO,
  STATUS_SERIAL_ATIVOS,
  TIPOS_ESTOQUE_SISTEMA,
} from "@/lib/dominio";
import { diasAtras, normalizar } from "@/lib/utils";

// ---------------------------------------------------------------------------
// 1.16 — Regras configuráveis de criticidade
// ---------------------------------------------------------------------------

export type Limiares = {
  normal: number;
  atencao: number;
  critico: number;
  /** dias sem movimentação para considerar material parado (1.17 / 1.32) */
  diasMaterialParado: number;
  /** variação de consumo que dispara alerta de anomalia (1.32) */
  desvioConsumo: number;
  /** dias aguardando devolução antes do alerta (1.17) */
  diasAguardandoDevolucao: number;
};

export const LIMIARES_PADRAO: Limiares = {
  normal: 50,
  atencao: 20,
  critico: 1,
  diasMaterialParado: 15,
  desvioConsumo: 30,
  diasAguardandoDevolucao: 7,
};

export async function limiares(): Promise<Limiares> {
  const registros = await prisma.configuracao.findMany({
    where: { chave: { startsWith: "estoque." } },
  });
  const mapa = Object.fromEntries(
    registros.map((r) => [r.chave.replace("estoque.", ""), Number(r.valor)]),
  );
  return { ...LIMIARES_PADRAO, ...mapa } as Limiares;
}

export async function salvarLimiares(valores: Partial<Limiares>) {
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined) continue;
    await prisma.configuracao.upsert({
      where: { chave: `estoque.${chave}` },
      create: { chave: `estoque.${chave}`, valor: String(valor) },
      update: { valor: String(valor) },
    });
  }
}

export type Nivel = "NORMAL" | "ATENCAO" | "CRITICO" | "SEM_ESTOQUE";

export function classificarNivel(
  disponivel: number,
  minima: number,
  ideal: number,
  regras: Limiares,
): { nivel: Nivel; percentual: number } {
  const base = ideal > 0 ? ideal : minima > 0 ? minima * 2 : 0;
  if (disponivel <= 0) return { nivel: "SEM_ESTOQUE", percentual: 0 };
  if (base <= 0) return { nivel: "NORMAL", percentual: 100 };

  const percentual = (disponivel / base) * 100;
  if (percentual >= regras.normal) return { nivel: "NORMAL", percentual };
  if (percentual >= regras.atencao) return { nivel: "ATENCAO", percentual };
  return { nivel: "CRITICO", percentual };
}

// ---------------------------------------------------------------------------
// Saldos consolidados
// ---------------------------------------------------------------------------

export type SaldoConsolidado = {
  materialId: string;
  nome: string;
  codigoInterno: string;
  categoria: string;
  categoriaId: string;
  cor: string;
  unidadeMedida: string;
  controle: string;
  fabricante: string | null;
  modelo: string | null;
  valorMedio: number;
  quantidadeMinima: number;
  quantidadeIdeal: number;
  /** soma em estoques operacionais (não inclui técnicos, equipes nem triagem) */
  emEstoque: number;
  emPosseTecnicos: number;
  emPosseEquipes: number;
  emTriagem: number;
  emManutencao: number;
  reservado: number;
  /** 1.14 — realmente disponível */
  disponivel: number;
  total: number;
  valorTotal: number;
  nivel: Nivel;
  percentual: number;
};

export async function saldosConsolidados(): Promise<SaldoConsolidado[]> {
  const [materiais, saldos, regras] = await Promise.all([
    prisma.material.findMany({
      where: { status: "ATIVO" },
      include: { categoria: true },
      orderBy: { nome: "asc" },
    }),
    prisma.saldo.findMany({
      include: { detentor: { include: { estoque: true } } },
    }),
    limiares(),
  ]);

  const porMaterial = new Map<string, typeof saldos>();
  for (const saldo of saldos) {
    const lista = porMaterial.get(saldo.materialId) ?? [];
    lista.push(saldo);
    porMaterial.set(saldo.materialId, lista);
  }

  return materiais.map((material) => {
    const linhas = porMaterial.get(material.id) ?? [];
    let emEstoque = 0;
    let emPosseTecnicos = 0;
    let emPosseEquipes = 0;
    let emTriagem = 0;
    let emManutencao = 0;
    let reservado = 0;

    for (const linha of linhas) {
      const tipoEstoque = linha.detentor.estoque?.tipo;
      reservado += linha.reservado;

      if (linha.detentor.tipo === "TECNICO") emPosseTecnicos += linha.quantidade;
      else if (linha.detentor.tipo === "EQUIPE") emPosseEquipes += linha.quantidade;
      else if (tipoEstoque === "TRIAGEM") emTriagem += linha.quantidade;
      else if (tipoEstoque === "MANUTENCAO") emManutencao += linha.quantidade;
      else if (tipoEstoque === "DESCARTE") {
        // material descartado não compõe mais o estoque da operação
      } else emEstoque += linha.quantidade;
    }

    const disponivel = emEstoque - reservado;
    const total = emEstoque + emPosseTecnicos + emPosseEquipes;
    const { nivel, percentual } = classificarNivel(
      disponivel,
      material.quantidadeMinima,
      material.quantidadeIdeal,
      regras,
    );

    return {
      materialId: material.id,
      nome: material.nome,
      codigoInterno: material.codigoInterno,
      categoria: material.categoria.nome,
      categoriaId: material.categoriaId,
      cor: material.categoria.cor,
      unidadeMedida: material.unidadeMedida,
      controle: material.controle,
      fabricante: material.fabricante,
      modelo: material.modelo,
      valorMedio: material.valorMedio,
      quantidadeMinima: material.quantidadeMinima,
      quantidadeIdeal: material.quantidadeIdeal,
      emEstoque,
      emPosseTecnicos,
      emPosseEquipes,
      emTriagem,
      emManutencao,
      reservado,
      disponivel,
      total,
      valorTotal: total * material.valorMedio,
      nivel,
      percentual,
    };
  });
}

// ---------------------------------------------------------------------------
// 1.18 — Dashboard
// ---------------------------------------------------------------------------

export async function resumoDashboard() {
  const [consolidado, seriais, aguardandoRecebimento, triagensAbertas, reservasAtivas] =
    await Promise.all([
      saldosConsolidados(),
      prisma.unidadeSerial.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.entrada.count({ where: { status: "AGUARDANDO_RECEBIMENTO" } }),
      prisma.triagem.count({ where: { status: { not: "CONCLUIDA" } } }),
      prisma.reserva.count({ where: { status: "ATIVA" } }),
    ]);

  const porStatusSerial = Object.fromEntries(
    seriais.map((s) => [s.status, s._count._all]),
  ) as Record<string, number>;

  const valorTotal = consolidado.reduce((soma, m) => soma + m.valorTotal, 0);

  return {
    valorTotal,
    totalMateriais: consolidado.length,
    totalItens: consolidado.reduce((s, m) => s + m.total, 0),
    disponiveis: consolidado.reduce((s, m) => s + Math.max(m.disponivel, 0), 0),
    emPosseTecnicos: consolidado.reduce((s, m) => s + m.emPosseTecnicos, 0),
    emPosseEquipes: consolidado.reduce((s, m) => s + m.emPosseEquipes, 0),
    emManutencao: consolidado.reduce((s, m) => s + m.emManutencao, 0),
    emTriagem: consolidado.reduce((s, m) => s + m.emTriagem, 0),
    reservado: consolidado.reduce((s, m) => s + m.reservado, 0),
    estoqueBaixo: consolidado.filter(
      (m) => m.nivel === "CRITICO" || m.nivel === "ATENCAO",
    ).length,
    semEstoque: consolidado.filter((m) => m.nivel === "SEM_ESTOQUE").length,
    criticos: consolidado.filter((m) => m.nivel === "CRITICO").length,
    aguardandoDevolucao: porStatusSerial["AGUARDANDO_DEVOLUCAO"] ?? 0,
    instalados: porStatusSerial["INSTALADO"] ?? 0,
    defeituosos:
      (porStatusSerial["DEFEITUOSO"] ?? 0) + (porStatusSerial["SUCATA"] ?? 0),
    perdidos: porStatusSerial["PERDIDO"] ?? 0,
    aguardandoRecebimento,
    triagensAbertas,
    reservasAtivas,
    porStatusSerial,
  };
}

// ---------------------------------------------------------------------------
// 1.19 — Entradas x Saídas
// ---------------------------------------------------------------------------

export async function movimentacaoPorPeriodo(dias: number) {
  const desde = diasAtras(dias);
  const movimentos = await prisma.movimento.findMany({
    where: { criadoEm: { gte: desde } },
    select: { tipo: true, quantidade: true, criadoEm: true, valorUnitario: true },
  });

  const agruparPorDia = dias <= 90;
  const buckets = new Map<
    string,
    { rotulo: string; entrada: number; saida: number; ordem: number }
  >();

  for (let i = dias - 1; i >= 0; i--) {
    const d = diasAtras(i);
    const chave = agruparPorDia
      ? d.toISOString().slice(0, 10)
      : d.toISOString().slice(0, 7);
    if (!buckets.has(chave)) {
      buckets.set(chave, {
        rotulo: agruparPorDia
          ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
          : d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
        entrada: 0,
        saida: 0,
        ordem: buckets.size,
      });
    }
  }

  for (const m of movimentos) {
    const chave = agruparPorDia
      ? m.criadoEm.toISOString().slice(0, 10)
      : m.criadoEm.toISOString().slice(0, 7);
    const bucket = buckets.get(chave);
    if (!bucket) continue;
    if (m.tipo === "ENTRADA" || m.tipo === "DEVOLUCAO") bucket.entrada += m.quantidade;
    if (MOVIMENTOS_DE_CONSUMO.includes(m.tipo)) bucket.saida += m.quantidade;
  }

  return [...buckets.values()].sort((a, b) => a.ordem - b.ordem);
}

// ---------------------------------------------------------------------------
// 1.20 / 1.21 / 1.22 — Consumo
// ---------------------------------------------------------------------------

export async function consumoPorMaterial(dias: number, limite = 10) {
  const movimentos = await prisma.movimento.findMany({
    where: {
      criadoEm: { gte: diasAtras(dias) },
      tipo: { in: MOVIMENTOS_DE_CONSUMO },
    },
    include: { material: { select: { nome: true, unidadeMedida: true, valorMedio: true } } },
  });

  const mapa = new Map<
    string,
    { materialId: string; nome: string; unidade: string; quantidade: number; valor: number }
  >();
  for (const m of movimentos) {
    const atual = mapa.get(m.materialId) ?? {
      materialId: m.materialId,
      nome: m.material.nome,
      unidade: m.material.unidadeMedida,
      quantidade: 0,
      valor: 0,
    };
    atual.quantidade += m.quantidade;
    atual.valor += m.quantidade * (m.valorUnitario ?? m.material.valorMedio);
    mapa.set(m.materialId, atual);
  }

  return [...mapa.values()]
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, limite);
}

/** consumo agrupado por quem recebeu o material (técnico ou equipe) */
export async function consumoPorDetentor(
  dias: number,
  tipo: "TECNICO" | "EQUIPE",
) {
  const movimentos = await prisma.movimento.findMany({
    where: {
      criadoEm: { gte: diasAtras(dias) },
      tipo: { in: ["SAIDA", "TRANSFERENCIA"] },
      destino: { tipo },
    },
    include: {
      destino: true,
      material: { select: { nome: true, unidadeMedida: true, valorMedio: true } },
    },
  });

  const mapa = new Map<
    string,
    {
      detentorId: string;
      nome: string;
      valor: number;
      total: number;
      materiais: { nome: string; unidade: string; quantidade: number }[];
    }
  >();

  for (const m of movimentos) {
    if (!m.destino) continue;
    const atual = mapa.get(m.destino.id) ?? {
      detentorId: m.destino.id,
      nome: m.destino.nome,
      valor: 0,
      total: 0,
      materiais: [],
    };
    atual.valor += m.quantidade * (m.valorUnitario ?? m.material.valorMedio);
    atual.total += m.quantidade;

    const existente = atual.materiais.find((x) => x.nome === m.material.nome);
    if (existente) existente.quantidade += m.quantidade;
    else
      atual.materiais.push({
        nome: m.material.nome,
        unidade: m.material.unidadeMedida,
        quantidade: m.quantidade,
      });

    mapa.set(m.destino.id, atual);
  }

  return [...mapa.values()]
    .map((d) => ({
      ...d,
      materiais: d.materiais.sort((a, b) => b.quantidade - a.quantidade).slice(0, 6),
    }))
    .sort((a, b) => b.valor - a.valor);
}

// ---------------------------------------------------------------------------
// 1.8 / 1.9 — Estoque de um detentor
// ---------------------------------------------------------------------------

export async function estoqueDoDetentor(detentorId: string) {
  const [detentor, saldos, unidades] = await Promise.all([
    prisma.detentor.findUnique({
      where: { id: detentorId },
      include: {
        estoque: { include: { responsavel: true } },
        tecnico: { include: { equipe: true } },
        equipe: true,
      },
    }),
    prisma.saldo.findMany({
      where: { detentorId, quantidade: { gt: 0 } },
      include: { material: { include: { categoria: true } } },
      orderBy: { material: { nome: "asc" } },
    }),
    prisma.unidadeSerial.findMany({
      where: { detentorId },
      include: { material: true },
      orderBy: { atualizadoEm: "desc" },
    }),
  ]);

  if (!detentor) return null;

  const valorTotal = saldos.reduce(
    (soma, s) => soma + s.quantidade * s.material.valorMedio,
    0,
  );

  return { detentor, saldos, unidades, valorTotal };
}

export async function listarDetentores(opcoes?: { incluirSistema?: boolean }) {
  const detentores = await prisma.detentor.findMany({
    include: { estoque: true, tecnico: true, equipe: true },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });
  if (opcoes?.incluirSistema) return detentores;
  return detentores.filter(
    (d) => !d.estoque || !TIPOS_ESTOQUE_SISTEMA.includes(d.estoque.tipo),
  );
}

// ---------------------------------------------------------------------------
// 1.23 — Timeline
// ---------------------------------------------------------------------------

export async function timelineMaterial(materialId: string, limite = 100) {
  return prisma.movimento.findMany({
    where: { materialId },
    include: {
      origem: true,
      destino: true,
      usuario: { select: { nome: true } },
      unidade: { select: { serial: true } },
      entrada: { select: { numero: true } },
      movimentacao: { select: { numero: true, tipo: true, motivo: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });
}

export async function timelineSerial(unidadeId: string) {
  return prisma.movimento.findMany({
    where: { unidadeId },
    include: {
      origem: true,
      destino: true,
      usuario: { select: { nome: true } },
      entrada: { select: { numero: true } },
      movimentacao: { select: { numero: true, tipo: true, motivo: true } },
    },
    orderBy: { criadoEm: "asc" },
  });
}

// ---------------------------------------------------------------------------
// 1.28 — Busca global
// ---------------------------------------------------------------------------

export type ResultadoBusca = {
  tipo: "MATERIAL" | "SERIAL" | "DETENTOR" | "ENTRADA" | "MOVIMENTACAO";
  titulo: string;
  subtitulo: string;
  detalhe?: string;
  href: string;
};

export async function buscaGlobal(termo: string): Promise<ResultadoBusca[]> {
  const busca = termo.trim();
  if (busca.length < 2) return [];

  const [materiais, seriais, detentores, entradas, movimentacoes] =
    await Promise.all([
      prisma.material.findMany({
        where: {
          OR: [
            { nome: { contains: busca } },
            { codigoInterno: { contains: busca } },
            { modelo: { contains: busca } },
            { fabricante: { contains: busca } },
            { codigoBarras: { contains: busca } },
          ],
        },
        include: { categoria: true },
        take: 8,
      }),
      prisma.unidadeSerial.findMany({
        where: {
          OR: [
            { serial: { contains: busca } },
            { macAddress: { contains: busca } },
            { patrimonio: { contains: busca } },
            { codigoBarras: { contains: busca } },
          ],
        },
        include: { material: true, detentor: true },
        take: 8,
      }),
      prisma.detentor.findMany({
        where: { nome: { contains: busca } },
        include: { estoque: true, tecnico: true, equipe: true },
        take: 6,
      }),
      prisma.entrada.findMany({
        where: {
          OR: [{ numero: { contains: busca } }, { documento: { contains: busca } }],
        },
        include: { destino: true },
        take: 4,
      }),
      prisma.movimentacao.findMany({
        where: { numero: { contains: busca } },
        include: { origem: true, destino: true },
        take: 4,
      }),
    ]);

  const resultados: ResultadoBusca[] = [
    ...materiais.map((m) => ({
      tipo: "MATERIAL" as const,
      titulo: m.nome,
      subtitulo: `${m.codigoInterno} · ${m.categoria.nome}`,
      detalhe: [m.fabricante, m.modelo].filter(Boolean).join(" ") || undefined,
      href: `/materiais/${m.id}`,
    })),
    ...seriais.map((u) => ({
      tipo: "SERIAL" as const,
      titulo: u.serial,
      subtitulo: u.material.nome,
      detalhe: u.detentor ? `Com ${u.detentor.nome}` : u.status,
      href: `/seriais/${u.id}`,
    })),
    ...detentores.map((d) => ({
      tipo: "DETENTOR" as const,
      titulo: d.nome,
      subtitulo:
        d.tipo === "ESTOQUE" ? "Local de estoque" : d.tipo === "TECNICO" ? "Técnico" : "Equipe",
      href: `/locais/${d.id}`,
    })),
    ...entradas.map((e) => ({
      tipo: "ENTRADA" as const,
      titulo: e.numero,
      subtitulo: `Entrada · ${e.destino.nome}`,
      detalhe: e.documento ?? undefined,
      href: `/entradas/${e.id}`,
    })),
    ...movimentacoes.map((m) => ({
      tipo: "MOVIMENTACAO" as const,
      titulo: m.numero,
      subtitulo: `${m.tipo} · ${m.origem?.nome ?? "—"} → ${m.destino?.nome ?? "—"}`,
      href: `/movimentacoes/${m.id}`,
    })),
  ];

  const alvo = normalizar(busca);
  return resultados.sort((a, b) => {
    const pa = normalizar(a.titulo).startsWith(alvo) ? 0 : 1;
    const pb = normalizar(b.titulo).startsWith(alvo) ? 0 : 1;
    return pa - pb;
  });
}

// ---------------------------------------------------------------------------
// Apoio a listagens
// ---------------------------------------------------------------------------

export async function seriaisAtivosPorMaterial(materialId: string) {
  return prisma.unidadeSerial.findMany({
    where: { materialId, status: { in: STATUS_SERIAL_ATIVOS } },
    include: { detentor: true },
    orderBy: { serial: "asc" },
  });
}

export async function seriaisDisponiveisEm(detentorId: string, materialId: string) {
  return prisma.unidadeSerial.findMany({
    where: {
      detentorId,
      materialId,
      status: { in: ["DISPONIVEL", "EM_POSSE_TECNICO", "EM_USO", "AGUARDANDO_DEVOLUCAO"] },
    },
    orderBy: { serial: "asc" },
  });
}
