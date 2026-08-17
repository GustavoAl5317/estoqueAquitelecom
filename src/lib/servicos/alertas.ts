import { prisma } from "@/lib/prisma";
import { MOVIMENTOS_DE_CONSUMO } from "@/lib/dominio";
import { diasAtras, numero, quantidade } from "@/lib/utils";
import { limiares, saldosConsolidados } from "./consultas";

export type Alerta = {
  id: string;
  severidade: "CRITICO" | "ATENCAO" | "INFO";
  categoria:
    | "ESTOQUE_MINIMO"
    | "SEM_ESTOQUE"
    | "CONSUMO"
    | "MATERIAL_PARADO"
    | "DEVOLUCAO"
    | "TRIAGEM"
    | "RECEBIMENTO"
    | "RESERVA";
  titulo: string;
  detalhe: string;
  href?: string;
};

/**
 * 1.17 — CENTRAL DE ALERTAS.
 *
 * Os alertas são calculados a partir do estado atual, e não armazenados: isso
 * evita que um alerta continue aberto depois que o problema já foi resolvido.
 */
export async function alertasDoEstoque(): Promise<Alerta[]> {
  const regras = await limiares();
  const alertas: Alerta[] = [];

  const [consolidado, aguardandoDevolucao, triagens, entradasPendentes, reservas] =
    await Promise.all([
      saldosConsolidados(),
      prisma.unidadeSerial.findMany({
        where: { status: "AGUARDANDO_DEVOLUCAO" },
        include: { material: true, detentor: true },
      }),
      prisma.triagem.findMany({
        where: { status: { not: "CONCLUIDA" } },
        include: { material: true, unidade: true },
      }),
      prisma.entrada.findMany({
        where: { status: "AGUARDANDO_RECEBIMENTO" },
        include: { destino: true },
      }),
      prisma.reserva.findMany({
        where: { status: "ATIVA", expiraEm: { not: null } },
        include: { material: true },
      }),
    ]);

  // 1.15 / 1.16 — estoque mínimo e criticidade
  for (const material of consolidado) {
    if (material.nivel === "SEM_ESTOQUE") {
      alertas.push({
        id: `sem-estoque-${material.materialId}`,
        severidade: "CRITICO",
        categoria: "SEM_ESTOQUE",
        titulo: `${material.nome} sem estoque disponível`,
        detalhe:
          `Estoque mínimo definido: ${quantidade(material.quantidadeMinima, material.unidadeMedida)}.` +
          (material.emPosseTecnicos > 0
            ? ` Há ${quantidade(material.emPosseTecnicos, material.unidadeMedida)} em posse de técnicos.`
            : ""),
        href: `/materiais/${material.materialId}`,
      });
    } else if (material.disponivel < material.quantidadeMinima) {
      alertas.push({
        id: `minimo-${material.materialId}`,
        severidade: material.nivel === "CRITICO" ? "CRITICO" : "ATENCAO",
        categoria: "ESTOQUE_MINIMO",
        titulo: `${material.nome} abaixo do estoque mínimo`,
        detalhe: `Disponível ${quantidade(material.disponivel, material.unidadeMedida)} de um mínimo de ${quantidade(material.quantidadeMinima, material.unidadeMedida)}.`,
        href: `/materiais/${material.materialId}`,
      });
    }
  }

  // 1.17 / 1.32 — consumo fora do padrão
  for (const desvio of await desviosDeConsumo(regras.desvioConsumo)) {
    alertas.push({
      id: `consumo-${desvio.materialId}`,
      severidade: desvio.variacao >= regras.desvioConsumo * 2 ? "CRITICO" : "ATENCAO",
      categoria: "CONSUMO",
      titulo: `${desvio.nome} com consumo ${numero(desvio.variacao)}% acima da média`,
      detalhe: `Últimos 30 dias: ${numero(desvio.atual)} · 30 dias anteriores: ${numero(desvio.anterior)}.`,
      href: `/materiais/${desvio.materialId}`,
    });
  }

  // 1.17 — material parado com técnico
  for (const parado of await materiaisParados(regras.diasMaterialParado)) {
    alertas.push({
      id: `parado-${parado.detentorId}-${parado.materialId}`,
      severidade: "ATENCAO",
      categoria: "MATERIAL_PARADO",
      titulo: `${parado.detentorNome} possui ${quantidade(parado.quantidade, parado.unidade)} de ${parado.materialNome} sem movimentação`,
      detalhe: `Sem movimentação há ${parado.dias} dias.`,
      href: `/locais/${parado.detentorId}`,
    });
  }

  // 1.17 — aguardando devolução
  for (const unidade of aguardandoDevolucao) {
    const dias = Math.floor(
      (Date.now() - unidade.atualizadoEm.getTime()) / 86_400_000,
    );
    if (dias < regras.diasAguardandoDevolucao) continue;
    alertas.push({
      id: `devolucao-${unidade.id}`,
      severidade: dias >= regras.diasAguardandoDevolucao * 2 ? "CRITICO" : "ATENCAO",
      categoria: "DEVOLUCAO",
      titulo: `${unidade.material.nome} aguardando devolução há ${dias} dias`,
      detalhe: `Serial ${unidade.serial}${unidade.detentor ? ` em posse de ${unidade.detentor.nome}` : ""}.`,
      href: `/seriais/${unidade.id}`,
    });
  }

  // 1.12 / 1.17 — devolvido e ainda não triado
  const triagensAntigas = triagens.filter(
    (t) => Date.now() - t.criadoEm.getTime() > 2 * 86_400_000,
  );
  if (triagensAntigas.length) {
    alertas.push({
      id: "triagem-pendente",
      severidade: "ATENCAO",
      categoria: "TRIAGEM",
      titulo: `${triagensAntigas.length} item(ns) devolvidos ainda não passaram pela triagem`,
      detalhe: triagensAntigas
        .slice(0, 3)
        .map((t) => `${t.material.nome}${t.unidade ? ` (${t.unidade.serial})` : ""}`)
        .join(", "),
      href: "/triagem",
    });
  }

  // 1.5 — entradas paradas aguardando conferência
  for (const entrada of entradasPendentes) {
    const dias = Math.floor((Date.now() - entrada.criadoEm.getTime()) / 86_400_000);
    if (dias < 2) continue;
    alertas.push({
      id: `recebimento-${entrada.id}`,
      severidade: dias >= 7 ? "CRITICO" : "ATENCAO",
      categoria: "RECEBIMENTO",
      titulo: `Entrada ${entrada.numero} aguardando recebimento há ${dias} dias`,
      detalhe: `Destino: ${entrada.destino.nome}. O material não conta como disponível até a conferência.`,
      href: `/entradas/${entrada.id}`,
    });
  }

  // 1.14 — reservas prestes a expirar
  for (const reserva of reservas) {
    if (!reserva.expiraEm) continue;
    const horas = (reserva.expiraEm.getTime() - Date.now()) / 3_600_000;
    if (horas > 48) continue;
    alertas.push({
      id: `reserva-${reserva.id}`,
      severidade: horas <= 0 ? "CRITICO" : "INFO",
      categoria: "RESERVA",
      titulo:
        horas <= 0
          ? `Reserva de ${reserva.material.nome} vencida`
          : `Reserva de ${reserva.material.nome} expira em ${Math.round(horas)}h`,
      detalhe: `${numero(reserva.quantidade)} un. reservada(s) para ${reserva.finalidade.toLowerCase().replace("_", " ")}.`,
      href: "/reservas",
    });
  }

  const ordem = { CRITICO: 0, ATENCAO: 1, INFO: 2 };
  return alertas.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}

// ---------------------------------------------------------------------------

/** 1.32 — compara os últimos 30 dias com os 30 anteriores */
export async function desviosDeConsumo(percentualMinimo: number) {
  const [atuais, anteriores] = await Promise.all([
    prisma.movimento.findMany({
      where: {
        tipo: { in: MOVIMENTOS_DE_CONSUMO },
        criadoEm: { gte: diasAtras(30) },
      },
      include: { material: { select: { nome: true } } },
    }),
    prisma.movimento.findMany({
      where: {
        tipo: { in: MOVIMENTOS_DE_CONSUMO },
        criadoEm: { gte: diasAtras(60), lt: diasAtras(30) },
      },
      select: { materialId: true, quantidade: true },
    }),
  ]);

  const somaAtual = new Map<string, { nome: string; total: number }>();
  for (const m of atuais) {
    const atual = somaAtual.get(m.materialId) ?? { nome: m.material.nome, total: 0 };
    atual.total += m.quantidade;
    somaAtual.set(m.materialId, atual);
  }

  const somaAnterior = new Map<string, number>();
  for (const m of anteriores) {
    somaAnterior.set(m.materialId, (somaAnterior.get(m.materialId) ?? 0) + m.quantidade);
  }

  const desvios = [];
  for (const [materialId, { nome, total }] of somaAtual) {
    const anterior = somaAnterior.get(materialId) ?? 0;
    if (anterior <= 0) continue;
    const variacao = ((total - anterior) / anterior) * 100;
    if (variacao < percentualMinimo) continue;
    desvios.push({ materialId, nome, atual: total, anterior, variacao });
  }
  return desvios.sort((a, b) => b.variacao - a.variacao);
}

/** 1.17 / 1.32 — material parado em posse de técnico ou equipe */
export async function materiaisParados(diasLimite: number) {
  const saldos = await prisma.saldo.findMany({
    where: {
      quantidade: { gt: 0 },
      detentor: { tipo: { in: ["TECNICO", "EQUIPE"] } },
    },
    include: { detentor: true, material: true },
  });

  const parados = [];
  for (const saldo of saldos) {
    const ultimo = await prisma.movimento.findFirst({
      where: {
        materialId: saldo.materialId,
        OR: [{ origemId: saldo.detentorId }, { destinoId: saldo.detentorId }],
      },
      orderBy: { criadoEm: "desc" },
      select: { criadoEm: true },
    });
    if (!ultimo) continue;

    const dias = Math.floor((Date.now() - ultimo.criadoEm.getTime()) / 86_400_000);
    if (dias < diasLimite) continue;

    parados.push({
      detentorId: saldo.detentorId,
      detentorNome: saldo.detentor.nome,
      materialId: saldo.materialId,
      materialNome: saldo.material.nome,
      unidade: saldo.material.unidadeMedida,
      quantidade: saldo.quantidade,
      dias,
    });
  }
  return parados.sort((a, b) => b.dias - a.dias);
}
