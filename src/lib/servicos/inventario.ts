import { prisma } from "@/lib/prisma";
import {
  ErroDeNegocio,
  arredondar,
  auditar,
  proximoNumero,
} from "./nucleo";
import { ajustarInterno } from "./movimentacoes";

/**
 * 1.26 — INVENTÁRIO.
 *
 * INICIAR → CONTAGEM → COMPARAÇÃO → DIVERGÊNCIAS → AJUSTE → FINALIZAÇÃO
 *
 * A contagem congela o saldo do sistema no momento da abertura, para que a
 * comparação seja justa mesmo que existam movimentações em paralelo.
 */
export async function iniciarInventario(
  dados: { detentorId: string; observacao?: string | null },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const emAberto = await tx.inventario.findFirst({
      where: {
        detentorId: dados.detentorId,
        status: { in: ["EM_CONTAGEM", "EM_CONFERENCIA"] },
      },
    });
    if (emAberto) {
      throw new ErroDeNegocio(
        `Já existe um inventário em andamento (${emAberto.numero}) para este local.`,
      );
    }

    const saldos = await tx.saldo.findMany({
      where: { detentorId: dados.detentorId },
      include: { material: { select: { nome: true } } },
    });
    if (!saldos.length) {
      throw new ErroDeNegocio("Este local não possui saldo para inventariar.");
    }

    const numero = await proximoNumero(tx, "inventario");
    const inventario = await tx.inventario.create({
      data: {
        numero,
        detentorId: dados.detentorId,
        iniciadoPorId: usuarioId,
        observacao: dados.observacao ?? null,
        itens: {
          create: saldos.map((s) => ({
            materialId: s.materialId,
            quantidadeSistema: s.quantidade,
          })),
        },
      },
    });

    await auditar(tx, {
      entidade: "Inventario",
      entidadeId: inventario.id,
      acao: "INVENTARIO",
      descricao: `Inventário ${numero} iniciado com ${saldos.length} materiais.`,
      usuarioId,
    });

    return inventario;
  });
}

export async function registrarContagem(
  itens: { itemId: string; quantidadeContada: number | null; observacao?: string | null }[],
) {
  return prisma.$transaction(async (tx) => {
    for (const entrada of itens) {
      const item = await tx.inventarioItem.findUnique({
        where: { id: entrada.itemId },
      });
      if (!item) continue;

      const contada =
        entrada.quantidadeContada === null
          ? null
          : arredondar(entrada.quantidadeContada);

      await tx.inventarioItem.update({
        where: { id: item.id },
        data: {
          quantidadeContada: contada,
          diferenca:
            contada === null ? null : arredondar(contada - item.quantidadeSistema),
          observacao: entrada.observacao ?? item.observacao,
        },
      });
    }
  });
}

/**
 * Aplica os ajustes das divergências e encerra o inventário.
 * Materiais serializados não são ajustados por quantidade: a divergência fica
 * registrada para conferência unidade a unidade.
 */
export async function finalizarInventario(
  dados: { inventarioId: string; motivo: string },
  usuarioId: string,
) {
  if (!dados.motivo?.trim()) {
    throw new ErroDeNegocio("Informe o motivo dos ajustes do inventário.");
  }

  return prisma.$transaction(async (tx) => {
    const inventario = await tx.inventario.findUnique({
      where: { id: dados.inventarioId },
      include: { itens: { include: { material: true } } },
    });
    if (!inventario) throw new ErroDeNegocio("Inventário não encontrado.");
    if (inventario.status === "CONCLUIDO") {
      throw new ErroDeNegocio("Este inventário já foi concluído.");
    }

    const naoContados = inventario.itens.filter(
      (i) => i.quantidadeContada === null,
    );
    if (naoContados.length) {
      throw new ErroDeNegocio(
        `${naoContados.length} material(is) ainda não foram contados.`,
      );
    }

    let ajustados = 0;
    let pendentesSerial = 0;

    for (const item of inventario.itens) {
      const diferenca = arredondar(
        (item.quantidadeContada ?? 0) - item.quantidadeSistema,
      );
      if (diferenca === 0) continue;

      if (item.material.controle === "SERIAL") {
        pendentesSerial += 1;
        await tx.inventarioItem.update({
          where: { id: item.id },
          data: {
            observacao:
              `Divergência de ${diferenca} unidade(s) em material serializado — ` +
              `conferir status individual dos seriais. ${item.observacao ?? ""}`.trim(),
          },
        });
        continue;
      }

      await ajustarInterno(
        tx,
        {
          detentorId: inventario.detentorId,
          materialId: item.materialId,
          quantidadeContada: item.quantidadeContada ?? 0,
          motivo: `Inventário ${inventario.numero}: ${dados.motivo}`,
          inventarioId: inventario.id,
        },
        usuarioId,
      );

      await tx.inventarioItem.update({
        where: { id: item.id },
        data: { ajustado: true },
      });
      ajustados += 1;
    }

    const atualizado = await tx.inventario.update({
      where: { id: inventario.id },
      data: { status: "CONCLUIDO", finalizadoEm: new Date() },
    });

    await auditar(tx, {
      entidade: "Inventario",
      entidadeId: inventario.id,
      acao: "INVENTARIO",
      descricao:
        `Inventário ${inventario.numero} finalizado. ${ajustados} ajuste(s) aplicado(s)` +
        (pendentesSerial
          ? `, ${pendentesSerial} divergência(s) em material serializado para conferência.`
          : "."),
      usuarioId,
      depois: { ajustados, pendentesSerial, motivo: dados.motivo },
    });

    return { inventario: atualizado, ajustados, pendentesSerial };
  });
}

export async function cancelarInventario(inventarioId: string, usuarioId: string) {
  const inventario = await prisma.inventario.update({
    where: { id: inventarioId },
    data: { status: "CANCELADO", finalizadoEm: new Date() },
  });
  await auditar(prisma, {
    entidade: "Inventario",
    entidadeId: inventarioId,
    acao: "INVENTARIO",
    descricao: `Inventário ${inventario.numero} cancelado.`,
    usuarioId,
  });
  return inventario;
}
