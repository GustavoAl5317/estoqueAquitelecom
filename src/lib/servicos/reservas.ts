import { prisma } from "@/lib/prisma";
import {
  ErroDeNegocio,
  aplicarReservado,
  arredondar,
  auditar,
  registrarMovimento,
} from "./nucleo";

/**
 * 1.14 — RESERVA DE MATERIAL.
 * A reserva não move nada: ela apenas separa parte do saldo, de modo que
 * "realmente disponível" = saldo − reservado.
 */
export async function criarReserva(
  dados: {
    materialId: string;
    detentorId: string;
    quantidade: number;
    finalidade: string;
    unidadeId?: string | null;
    tecnicoId?: string | null;
    equipeId?: string | null;
    ordemServicoId?: string | null;
    expiraEm?: Date | null;
    observacao?: string | null;
  },
  usuarioId: string,
) {
  const quantidade = arredondar(dados.quantidade);
  if (quantidade <= 0) {
    throw new ErroDeNegocio("A quantidade reservada deve ser maior que zero.");
  }

  return prisma.$transaction(async (tx) => {
    if (dados.unidadeId) {
      const unidade = await tx.unidadeSerial.findUnique({
        where: { id: dados.unidadeId },
      });
      if (!unidade) throw new ErroDeNegocio("Unidade não encontrada.");
      if (unidade.status !== "DISPONIVEL") {
        throw new ErroDeNegocio(
          `O serial ${unidade.serial} não está disponível para reserva.`,
        );
      }
      await tx.unidadeSerial.update({
        where: { id: unidade.id },
        data: { status: "RESERVADO" },
      });
    }

    await aplicarReservado(tx, dados.materialId, dados.detentorId, quantidade);

    const reserva = await tx.reserva.create({
      data: {
        materialId: dados.materialId,
        detentorId: dados.detentorId,
        quantidade,
        finalidade: dados.finalidade,
        unidadeId: dados.unidadeId ?? null,
        tecnicoId: dados.tecnicoId ?? null,
        equipeId: dados.equipeId ?? null,
        ordemServicoId: dados.ordemServicoId ?? null,
        expiraEm: dados.expiraEm ?? null,
        observacao: dados.observacao ?? null,
        criadoPorId: usuarioId,
      },
      include: { material: true, detentor: true },
    });

    await registrarMovimento(tx, {
      tipo: "RESERVA",
      materialId: dados.materialId,
      unidadeId: dados.unidadeId ?? null,
      quantidade,
      origemId: dados.detentorId,
      usuarioId,
      ordemServicoId: dados.ordemServicoId ?? null,
      observacao: `Reserva para ${dados.finalidade.toLowerCase().replace("_", " ")}`,
    });

    await auditar(tx, {
      entidade: "Reserva",
      entidadeId: reserva.id,
      acao: "RESERVA",
      descricao: `Reservadas ${quantidade} un. de "${reserva.material.nome}" em ${reserva.detentor.nome}.`,
      usuarioId,
      depois: { quantidade, finalidade: dados.finalidade },
    });

    return reserva;
  });
}

export async function encerrarReserva(
  reservaId: string,
  status: "CANCELADA" | "EXPIRADA" | "CONSUMIDA",
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const reserva = await tx.reserva.findUnique({
      where: { id: reservaId },
      include: { material: true },
    });
    if (!reserva) throw new ErroDeNegocio("Reserva não encontrada.");
    if (reserva.status !== "ATIVA") {
      throw new ErroDeNegocio("Esta reserva já foi encerrada.");
    }

    await aplicarReservado(
      tx,
      reserva.materialId,
      reserva.detentorId,
      -reserva.quantidade,
    );

    if (reserva.unidadeId && status !== "CONSUMIDA") {
      await tx.unidadeSerial.update({
        where: { id: reserva.unidadeId },
        data: { status: "DISPONIVEL" },
      });
    }

    const atualizada = await tx.reserva.update({
      where: { id: reservaId },
      data: { status, encerradoEm: new Date() },
    });

    await registrarMovimento(tx, {
      tipo: "LIBERACAO_RESERVA",
      materialId: reserva.materialId,
      unidadeId: reserva.unidadeId,
      quantidade: reserva.quantidade,
      origemId: reserva.detentorId,
      usuarioId,
      observacao: `Reserva ${status.toLowerCase()}`,
    });

    await auditar(tx, {
      entidade: "Reserva",
      entidadeId: reservaId,
      acao: "RESERVA",
      descricao: `Reserva de "${reserva.material.nome}" ${status.toLowerCase()}.`,
      usuarioId,
      antes: { status: "ATIVA" },
      depois: { status },
    });

    return atualizada;
  });
}

/** Expira automaticamente reservas vencidas — chamado ao abrir a central. */
export async function expirarReservasVencidas(usuarioId: string) {
  const vencidas = await prisma.reserva.findMany({
    where: { status: "ATIVA", expiraEm: { lt: new Date() } },
    select: { id: true },
  });
  for (const reserva of vencidas) {
    await encerrarReserva(reserva.id, "EXPIRADA", usuarioId);
  }
  return vencidas.length;
}
