import { prisma } from "@/lib/prisma";
import { TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { vincularOrdemServico } from "./ordens";
import {
  ErroDeNegocio,
  aplicarReservado,
  aplicarSaldo,
  arredondar,
  auditar,
  detentorPorId,
  estoqueDeSistema,
  proximoNumero,
  registrarMovimento,
  type Tx,
} from "./nucleo";

export type ItemMovimentacao = {
  materialId: string;
  /** ignorado quando o material é serializado — a quantidade vem dos seriais */
  quantidade?: number;
  seriaisIds?: string[];
  /** 1.11 — estado informado na devolução */
  estadoFisico?: string | null;
};

export type NovaMovimentacao = {
  /** SAIDA | TRANSFERENCIA | DEVOLUCAO | BAIXA */
  tipo: string;
  finalidade: string;
  origemId: string;
  destinoId?: string | null;
  solicitanteId?: string | null;
  motivo?: string | null;
  observacao?: string | null;
  ordemServicoId?: string | null;
  /**
   * Vínculo leve com a OS: número e cliente digitados no lançamento. O sistema
   * cria o registro mínimo da OS se ele ainda não existir — sem depender do SGP.
   */
  osNumero?: string | null;
  osCliente?: string | null;
  /** identificação do cliente em instalações e retiradas */
  clienteRef?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** 1.14 — reservas consumidas por esta movimentação */
  reservasIds?: string[];
  /** 1.12 — força (ou dispensa) a passagem por triagem numa devolução */
  exigirTriagem?: boolean;
  itens: ItemMovimentacao[];
};

/**
 * Motor único de movimentação (1.7, 1.10, 1.11, 1.12).
 *
 * Tirar de um detentor e entregar a outro é sempre a mesma operação — o que
 * muda é o tipo, a finalidade e o status resultante das unidades serializadas.
 */
export async function registrarMovimentacao(
  dados: NovaMovimentacao,
  usuarioId: string,
) {
  if (!dados.itens.length) {
    throw new ErroDeNegocio("Informe ao menos um material na movimentação.");
  }
  if (dados.tipo === "AJUSTE") {
    throw new ErroDeNegocio("Ajustes devem ser feitos por registrarAjuste().");
  }

  return prisma.$transaction(async (tx) => {
    const origem = await detentorPorId(tx, dados.origemId);

    let destinoId = dados.destinoId ?? null;
    let triagemNecessaria = false;

    if (dados.tipo === "DEVOLUCAO") {
      triagemNecessaria =
        dados.exigirTriagem ?? (await precisaDeTriagem(tx, dados));
      if (triagemNecessaria) {
        const triagem = await estoqueDeSistema(tx, "TRIAGEM");
        destinoId = triagem.id;
      }
    }

    if (dados.finalidade === "INSTALACAO") {
      destinoId = null; // o equipamento passa a residir no cliente
    } else if (dados.tipo === "BAIXA") {
      // baixa pode ter destino (área de descarte) ou sair do controle de saldo
      destinoId = destinoId ?? null;
    } else if (!destinoId) {
      throw new ErroDeNegocio("Informe o destino da movimentação.");
    }

    if (destinoId === dados.origemId) {
      throw new ErroDeNegocio("Origem e destino não podem ser o mesmo detentor.");
    }
    if (destinoId) await detentorPorId(tx, destinoId);

    // 1.14 — libera as reservas que estão sendo consumidas
    for (const reservaId of dados.reservasIds ?? []) {
      await consumirReservaInterno(tx, reservaId, usuarioId);
    }

    // 1.34 — vínculo com a OS, criado sob demanda a partir do número informado
    let ordemServicoId = dados.ordemServicoId ?? null;
    if (!ordemServicoId && dados.osNumero?.trim()) {
      const ordem = await vincularOrdemServico(tx, {
        numero: dados.osNumero,
        cliente: dados.osCliente,
      });
      ordemServicoId = ordem.id;
    }

    const numero = await proximoNumero(tx, "movimentacao");
    const movimentacao = await tx.movimentacao.create({
      data: {
        numero,
        tipo: dados.tipo,
        finalidade: dados.finalidade,
        origemId: dados.origemId,
        destinoId,
        solicitanteId: dados.solicitanteId ?? null,
        responsavelId: usuarioId,
        motivo: dados.motivo ?? null,
        observacao: dados.observacao ?? null,
        ordemServicoId,
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
      },
    });

    const destino = destinoId ? await detentorPorId(tx, destinoId) : null;

    for (const item of dados.itens) {
      const material = await tx.material.findUnique({
        where: { id: item.materialId },
        select: { id: true, nome: true, controle: true, valorMedio: true },
      });
      if (!material) throw new ErroDeNegocio("Material não encontrado.");

      const serializado = material.controle === "SERIAL";
      const seriaisIds = item.seriaisIds ?? [];

      if (serializado && seriaisIds.length === 0) {
        throw new ErroDeNegocio(
          `"${material.nome}" é serializado: selecione as unidades a movimentar.`,
        );
      }

      const quantidade = serializado
        ? seriaisIds.length
        : arredondar(item.quantidade ?? 0);

      if (quantidade <= 0) {
        throw new ErroDeNegocio(
          `Informe uma quantidade válida para "${material.nome}".`,
        );
      }

      await validarDisponibilidade(tx, material.id, dados.origemId, quantidade);

      const registroItem = await tx.movimentacaoItem.create({
        data: {
          movimentacaoId: movimentacao.id,
          materialId: material.id,
          quantidade,
          estadoFisico: item.estadoFisico ?? null,
          valorUnitario: material.valorMedio || null,
        },
      });

      await aplicarSaldo(tx, material.id, dados.origemId, -quantidade);
      if (destinoId) await aplicarSaldo(tx, material.id, destinoId, quantidade);

      const tipoMovimento = tipoDeMovimento(dados);

      if (serializado) {
        for (const unidadeId of seriaisIds) {
          const unidade = await tx.unidadeSerial.findUnique({
            where: { id: unidadeId },
          });
          if (!unidade) throw new ErroDeNegocio("Unidade serializada não encontrada.");
          if (unidade.materialId !== material.id) {
            throw new ErroDeNegocio(
              `O serial ${unidade.serial} não pertence a "${material.nome}".`,
            );
          }
          if (unidade.detentorId !== dados.origemId) {
            throw new ErroDeNegocio(
              `O serial ${unidade.serial} não está em posse da origem selecionada.`,
            );
          }

          const novoStatus = await statusResultante(tx, dados, destino);

          await tx.unidadeSerial.update({
            where: { id: unidadeId },
            data: {
              detentorId: destinoId,
              status: novoStatus,
              estadoFisico: item.estadoFisico ?? unidade.estadoFisico,
              clienteRef:
                dados.finalidade === "INSTALACAO"
                  ? (dados.clienteRef ?? unidade.clienteRef)
                  : dados.tipo === "DEVOLUCAO"
                    ? null
                    : unidade.clienteRef,
            },
          });

          await tx.movimentacaoItemSerial.create({
            data: { itemId: registroItem.id, unidadeId },
          });

          await registrarMovimento(tx, {
            tipo: tipoMovimento,
            materialId: material.id,
            unidadeId,
            quantidade: 1,
            origemId: dados.origemId,
            destinoId,
            usuarioId,
            movimentacaoId: movimentacao.id,
            ordemServicoId,
            valorUnitario: unidade.valorUnitario ?? material.valorMedio,
            latitude: dados.latitude ?? null,
            longitude: dados.longitude ?? null,
            observacao: `${numero} — serial ${unidade.serial}`,
          });

          if (triagemNecessaria) {
            await tx.triagem.create({
              data: {
                materialId: material.id,
                unidadeId,
                quantidade: 1,
                status: "AGUARDANDO",
                estadoRecebido: item.estadoFisico ?? unidade.estadoFisico,
                origemMovimentacaoId: movimentacao.id,
              },
            });
          }
        }
      } else {
        await registrarMovimento(tx, {
          tipo: tipoMovimento,
          materialId: material.id,
          quantidade,
          origemId: dados.origemId,
          destinoId,
          usuarioId,
          movimentacaoId: movimentacao.id,
          ordemServicoId,
          valorUnitario: material.valorMedio,
          latitude: dados.latitude ?? null,
          longitude: dados.longitude ?? null,
          observacao: numero,
        });

        if (triagemNecessaria) {
          await tx.triagem.create({
            data: {
              materialId: material.id,
              quantidade,
              status: "AGUARDANDO",
              estadoRecebido: item.estadoFisico ?? null,
              origemMovimentacaoId: movimentacao.id,
            },
          });
        }
      }
    }

    await auditar(tx, {
      entidade: "Movimentacao",
      entidadeId: movimentacao.id,
      acao: dados.tipo === "DEVOLUCAO" ? "DEVOLUCAO" : "MOVIMENTACAO",
      descricao:
        `${numero} — ${dados.tipo.toLowerCase()} de ${origem.nome}` +
        (destino ? ` para ${destino.nome}` : "") +
        ` (${dados.itens.length} item(ns)).` +
        (triagemNecessaria ? " Material encaminhado para triagem." : ""),
      usuarioId,
      depois: {
        numero,
        tipo: dados.tipo,
        finalidade: dados.finalidade,
        origem: origem.nome,
        destino: destino?.nome ?? null,
        triagem: triagemNecessaria,
      },
    });

    return { ...movimentacao, triagemNecessaria };
  });
}

/**
 * 1.25 — AJUSTE MANUAL. Motivo é obrigatório e o lançamento fica marcado como
 * ajuste no histórico; nunca acontece alteração silenciosa de saldo (1.24).
 */
export async function registrarAjuste(
  dados: {
    detentorId: string;
    materialId: string;
    quantidadeContada: number;
    motivo: string;
    inventarioId?: string | null;
  },
  usuarioId: string,
) {
  if (!dados.motivo?.trim()) {
    throw new ErroDeNegocio("O motivo do ajuste é obrigatório.");
  }

  return prisma.$transaction(async (tx) =>
    ajustarInterno(tx, dados, usuarioId),
  );
}

export async function ajustarInterno(
  tx: Tx,
  dados: {
    detentorId: string;
    materialId: string;
    quantidadeContada: number;
    motivo: string;
    inventarioId?: string | null;
  },
  usuarioId: string,
) {
  const saldo = await tx.saldo.findUnique({
    where: {
      materialId_detentorId: {
        materialId: dados.materialId,
        detentorId: dados.detentorId,
      },
    },
  });
  const atual = saldo?.quantidade ?? 0;
  const diferenca = arredondar(dados.quantidadeContada - atual);
  if (diferenca === 0) return null;

  const material = await tx.material.findUnique({
    where: { id: dados.materialId },
    select: { nome: true, controle: true, valorMedio: true },
  });
  if (material?.controle === "SERIAL") {
    throw new ErroDeNegocio(
      `"${material.nome}" é serializado: acerte o estoque pelo status de cada unidade, não por ajuste de quantidade.`,
    );
  }

  const numero = await proximoNumero(tx, "movimentacao");
  const movimentacao = await tx.movimentacao.create({
    data: {
      numero,
      tipo: "AJUSTE",
      finalidade: dados.inventarioId ? "AJUSTE_INVENTARIO" : "USO_INTERNO",
      origemId: diferenca < 0 ? dados.detentorId : null,
      destinoId: diferenca > 0 ? dados.detentorId : null,
      responsavelId: usuarioId,
      motivo: dados.motivo.trim(),
      itens: {
        create: {
          materialId: dados.materialId,
          quantidade: Math.abs(diferenca),
          valorUnitario: material?.valorMedio ?? null,
        },
      },
    },
  });

  await aplicarSaldo(tx, dados.materialId, dados.detentorId, diferenca);

  await registrarMovimento(tx, {
    tipo: "AJUSTE",
    materialId: dados.materialId,
    quantidade: Math.abs(diferenca),
    origemId: diferenca < 0 ? dados.detentorId : null,
    destinoId: diferenca > 0 ? dados.detentorId : null,
    usuarioId,
    movimentacaoId: movimentacao.id,
    inventarioId: dados.inventarioId ?? null,
    valorUnitario: material?.valorMedio ?? null,
    observacao: `Ajuste de inventário: sistema ${atual} → contagem ${dados.quantidadeContada}. ${dados.motivo}`,
  });

  await auditar(tx, {
    entidade: "Movimentacao",
    entidadeId: movimentacao.id,
    acao: "AJUSTE",
    descricao: `Ajuste de "${material?.nome}": ${atual} → ${dados.quantidadeContada} (${diferenca > 0 ? "+" : ""}${diferenca}). Motivo: ${dados.motivo}`,
    usuarioId,
    antes: { quantidade: atual },
    depois: { quantidade: dados.quantidadeContada, motivo: dados.motivo },
  });

  return { movimentacao, diferenca };
}

/**
 * Fluxo reverso 1.12 — equipamento retirado do cliente entra em posse do
 * técnico já marcado como aguardando devolução; nunca vira estoque disponível.
 */
export async function registrarRetiradaDeCliente(
  dados: {
    detentorId: string; // técnico que retirou
    materialId: string;
    unidadeId?: string | null;
    serial?: string | null;
    quantidade?: number;
    estadoFisico: string;
    clienteRef?: string | null;
    ordemServicoId?: string | null;
    observacao?: string | null;
  },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findUnique({
      where: { id: dados.materialId },
      select: { id: true, nome: true, controle: true, valorMedio: true },
    });
    if (!material) throw new ErroDeNegocio("Material não encontrado.");

    let unidadeId = dados.unidadeId ?? null;

    if (material.controle === "SERIAL") {
      if (!unidadeId && dados.serial) {
        const encontrada = await tx.unidadeSerial.findUnique({
          where: { serial: dados.serial.trim() },
        });
        unidadeId = encontrada?.id ?? null;
        if (!unidadeId) {
          // equipamento que nunca passou pelo estoque: cadastra na retirada
          const nova = await tx.unidadeSerial.create({
            data: {
              serial: dados.serial.trim(),
              materialId: material.id,
              estadoFisico: dados.estadoFisico,
              status: "INSTALADO",
              clienteRef: dados.clienteRef ?? null,
            },
          });
          unidadeId = nova.id;
        }
      }
      if (!unidadeId) {
        throw new ErroDeNegocio("Informe o serial do equipamento retirado.");
      }
      await tx.unidadeSerial.update({
        where: { id: unidadeId },
        data: {
          status: "AGUARDANDO_DEVOLUCAO",
          estadoFisico: dados.estadoFisico,
          detentorId: dados.detentorId,
          clienteRef: dados.clienteRef ?? undefined,
        },
      });
    }

    const quantidade =
      material.controle === "SERIAL" ? 1 : arredondar(dados.quantidade ?? 0);
    if (quantidade <= 0) throw new ErroDeNegocio("Informe a quantidade retirada.");

    await aplicarSaldo(tx, material.id, dados.detentorId, quantidade);

    await registrarMovimento(tx, {
      tipo: "RETIRADA_CLIENTE",
      materialId: material.id,
      unidadeId,
      quantidade,
      destinoId: dados.detentorId,
      usuarioId,
      ordemServicoId: dados.ordemServicoId ?? null,
      valorUnitario: material.valorMedio,
      observacao:
        dados.observacao ??
        `Retirado do cliente ${dados.clienteRef ?? "não informado"} — estado ${dados.estadoFisico}`,
    });

    const detentor = await detentorPorId(tx, dados.detentorId);
    await auditar(tx, {
      entidade: "UnidadeSerial",
      entidadeId: unidadeId ?? material.id,
      acao: "MOVIMENTACAO",
      descricao: `Retirada de cliente: "${material.nome}" passou para ${detentor.nome} aguardando devolução.`,
      usuarioId,
      depois: { estadoFisico: dados.estadoFisico, cliente: dados.clienteRef },
    });

    return { unidadeId, quantidade };
  });
}

// ---------------------------------------------------------------------------
// Regras auxiliares
// ---------------------------------------------------------------------------

function tipoDeMovimento(dados: NovaMovimentacao) {
  if (dados.finalidade === "INSTALACAO") return "INSTALACAO";
  if (dados.tipo === "DEVOLUCAO") return "DEVOLUCAO";
  if (dados.tipo === "BAIXA") return "BAIXA";
  if (dados.tipo === "TRANSFERENCIA") return "TRANSFERENCIA";
  return "SAIDA";
}

/** 1.13 — status da unidade conforme para onde ela foi. */
async function statusResultante(
  tx: Tx,
  dados: NovaMovimentacao,
  destino: { id: string; tipo: string; estoqueId: string | null } | null,
) {
  if (dados.finalidade === "INSTALACAO") return "INSTALADO";

  if (destino) {
    if (destino.tipo === "TECNICO") return "EM_POSSE_TECNICO";
    if (destino.tipo === "EQUIPE") return "EM_USO";
    if (destino.estoqueId) {
      const estoque = await tx.estoque.findUnique({
        where: { id: destino.estoqueId },
        select: { tipo: true },
      });
      if (estoque?.tipo === "TRIAGEM") return "EM_TRIAGEM";
      if (estoque?.tipo === "MANUTENCAO") return "EM_MANUTENCAO";
      if (estoque?.tipo === "DESCARTE") return "SUCATA";
    }
    return "DISPONIVEL";
  }

  if (dados.tipo === "BAIXA") {
    if (dados.finalidade === "PERDA") return "PERDIDO";
    if (dados.finalidade === "DEFEITO") return "DEFEITUOSO";
    return "BAIXADO";
  }
  return "BAIXADO";
}

/**
 * 1.12 — devolução em estado diferente de novo, ou equipamento que veio do
 * cliente, não retorna direto ao estoque disponível.
 */
async function precisaDeTriagem(tx: Tx, dados: NovaMovimentacao) {
  for (const item of dados.itens) {
    if (item.estadoFisico && item.estadoFisico !== "NOVO") return true;
    for (const unidadeId of item.seriaisIds ?? []) {
      const unidade = await tx.unidadeSerial.findUnique({
        where: { id: unidadeId },
        select: { status: true, estadoFisico: true },
      });
      if (!unidade) continue;
      if (unidade.status === "AGUARDANDO_DEVOLUCAO") return true;
      if (unidade.estadoFisico !== "NOVO") return true;
    }
  }
  return false;
}

/** 1.14 — o que está reservado não pode ser retirado por outra operação. */
async function validarDisponibilidade(
  tx: Tx,
  materialId: string,
  detentorId: string,
  quantidade: number,
) {
  const saldo = await tx.saldo.findUnique({
    where: { materialId_detentorId: { materialId, detentorId } },
  });
  const disponivel = arredondar((saldo?.quantidade ?? 0) - (saldo?.reservado ?? 0));
  if (quantidade > disponivel) {
    const material = await tx.material.findUnique({
      where: { id: materialId },
      select: { nome: true },
    });
    throw new ErroDeNegocio(
      `"${material?.nome}": disponível ${disponivel} (saldo ${saldo?.quantidade ?? 0}, ` +
        `reservado ${saldo?.reservado ?? 0}), solicitado ${quantidade}.`,
    );
  }
}

async function consumirReservaInterno(tx: Tx, reservaId: string, usuarioId: string) {
  const reserva = await tx.reserva.findUnique({ where: { id: reservaId } });
  if (!reserva) throw new ErroDeNegocio("Reserva não encontrada.");
  if (reserva.status !== "ATIVA") return;

  await aplicarReservado(tx, reserva.materialId, reserva.detentorId, -reserva.quantidade);
  await tx.reserva.update({
    where: { id: reservaId },
    data: { status: "CONSUMIDA", encerradoEm: new Date() },
  });
  await registrarMovimento(tx, {
    tipo: "LIBERACAO_RESERVA",
    materialId: reserva.materialId,
    quantidade: reserva.quantidade,
    origemId: reserva.detentorId,
    usuarioId,
    observacao: "Reserva consumida por movimentação",
  });
}

/** usado pelas telas para saber se um detentor é área de triagem/manutenção */
export function ehEstoqueDeSistema(tipoEstoque?: string | null) {
  return !!tipoEstoque && TIPOS_ESTOQUE_SISTEMA.includes(tipoEstoque);
}
