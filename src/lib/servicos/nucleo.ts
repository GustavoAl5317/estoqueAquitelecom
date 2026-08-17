import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** Cliente dentro ou fora de transação — todo serviço aceita os dois. */
export type Tx = Prisma.TransactionClient | typeof prisma;

export class ErroDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeNegocio";
  }
}

// ---------------------------------------------------------------------------
// Numeração de documentos
// ---------------------------------------------------------------------------

const PREFIXOS = {
  entrada: "ENT",
  movimentacao: "MOV",
  inventario: "INV",
} as const;

/**
 * Gera um número legível no formato PREFIXO-ANO-0001.
 * Roda dentro da transação e confere colisão, já que o campo é único.
 */
export async function proximoNumero(
  tx: Tx,
  documento: keyof typeof PREFIXOS,
): Promise<string> {
  const prefixo = PREFIXOS[documento];
  const ano = new Date().getFullYear();
  const inicio = `${prefixo}-${ano}-`;

  const ultimo = await (
    tx[documento] as {
      findFirst: (args: unknown) => Promise<{ numero: string } | null>;
    }
  ).findFirst({
    where: { numero: { startsWith: inicio } },
    orderBy: { numero: "desc" },
    select: { numero: true },
  });

  const sequencia = ultimo ? Number(ultimo.numero.slice(inicio.length)) + 1 : 1;
  return `${inicio}${String(sequencia).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------
// 1.24 — Auditoria
// ---------------------------------------------------------------------------

export async function auditar(
  tx: Tx,
  dados: {
    entidade: string;
    entidadeId: string;
    acao: string;
    descricao: string;
    usuarioId: string;
    antes?: unknown;
    depois?: unknown;
  },
) {
  return tx.auditoria.create({
    data: {
      entidade: dados.entidade,
      entidadeId: dados.entidadeId,
      acao: dados.acao,
      descricao: dados.descricao,
      usuarioId: dados.usuarioId,
      antes: dados.antes === undefined ? null : JSON.stringify(dados.antes),
      depois: dados.depois === undefined ? null : JSON.stringify(dados.depois),
    },
  });
}

// ---------------------------------------------------------------------------
// Saldos — o único ponto do sistema que altera quantidade
// ---------------------------------------------------------------------------

/**
 * Aplica um delta ao saldo de um material em um detentor.
 * Nunca permite saldo negativo: estoque só sai se existir.
 */
export async function aplicarSaldo(
  tx: Tx,
  materialId: string,
  detentorId: string,
  delta: number,
) {
  if (delta === 0) return;

  const saldo = await tx.saldo.findUnique({
    where: { materialId_detentorId: { materialId, detentorId } },
  });

  const atual = saldo?.quantidade ?? 0;
  const novo = arredondar(atual + delta);

  if (novo < 0) {
    const material = await tx.material.findUnique({
      where: { id: materialId },
      select: { nome: true, unidadeMedida: true },
    });
    const detentor = await tx.detentor.findUnique({
      where: { id: detentorId },
      select: { nome: true },
    });
    throw new ErroDeNegocio(
      `Saldo insuficiente de "${material?.nome ?? materialId}" em ${detentor?.nome ?? detentorId}. ` +
        `Disponível: ${atual}, solicitado: ${Math.abs(delta)}.`,
    );
  }

  if (saldo) {
    await tx.saldo.update({
      where: { id: saldo.id },
      data: { quantidade: novo },
    });
  } else {
    await tx.saldo.create({
      data: { materialId, detentorId, quantidade: novo },
    });
  }
}

/** 1.14 — reserva não retira do saldo, apenas reduz o "realmente disponível". */
export async function aplicarReservado(
  tx: Tx,
  materialId: string,
  detentorId: string,
  delta: number,
) {
  const saldo = await tx.saldo.findUnique({
    where: { materialId_detentorId: { materialId, detentorId } },
  });
  if (!saldo) {
    if (delta <= 0) return;
    throw new ErroDeNegocio(
      "Não é possível reservar um material que não possui saldo neste detentor.",
    );
  }

  const novo = arredondar(saldo.reservado + delta);
  if (novo < 0) {
    throw new ErroDeNegocio("Reserva inconsistente: valor reservado ficaria negativo.");
  }
  if (novo > saldo.quantidade) {
    throw new ErroDeNegocio(
      `Não há saldo livre suficiente para reservar. ` +
        `Saldo: ${saldo.quantidade}, já reservado: ${saldo.reservado}.`,
    );
  }

  await tx.saldo.update({ where: { id: saldo.id }, data: { reservado: novo } });
}

/** Evita ruído de ponto flutuante em metragens (0.1 + 0.2). */
export function arredondar(valor: number) {
  return Math.round(valor * 1e6) / 1e6;
}

// ---------------------------------------------------------------------------
// 1.23 — Razão de movimentos
// ---------------------------------------------------------------------------

export type RegistroMovimento = {
  tipo: string;
  materialId: string;
  quantidade: number;
  usuarioId: string;
  unidadeId?: string | null;
  origemId?: string | null;
  destinoId?: string | null;
  entradaId?: string | null;
  movimentacaoId?: string | null;
  inventarioId?: string | null;
  ordemServicoId?: string | null;
  valorUnitario?: number | null;
  observacao?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  local?: string | null;
};

export async function registrarMovimento(tx: Tx, dados: RegistroMovimento) {
  return tx.movimento.create({ data: dados });
}

// ---------------------------------------------------------------------------
// Detentores e estoques de sistema
// ---------------------------------------------------------------------------

export async function detentorPorId(tx: Tx, id: string) {
  const detentor = await tx.detentor.findUnique({ where: { id } });
  if (!detentor) throw new ErroDeNegocio("Detentor não encontrado.");
  return detentor;
}

/**
 * 1.12 — estoques de sistema usados pela logística reversa.
 * São criados sob demanda para que o fluxo funcione em qualquer instalação.
 */
export async function estoqueDeSistema(
  tx: Tx,
  tipo: "TRIAGEM" | "MANUTENCAO" | "DESCARTE",
) {
  const nomes = {
    TRIAGEM: "Triagem — Logística Reversa",
    MANUTENCAO: "Manutenção",
    DESCARTE: "Descarte / Sucata",
  } as const;

  const existente = await tx.detentor.findFirst({
    where: { tipo: "ESTOQUE", estoque: { tipo } },
  });
  if (existente) return existente;

  const estoque = await tx.estoque.create({
    data: { nome: nomes[tipo], tipo, status: "ATIVO" },
  });
  return tx.detentor.create({
    data: { tipo: "ESTOQUE", nome: estoque.nome, estoqueId: estoque.id },
  });
}
