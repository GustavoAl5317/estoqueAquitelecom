import { prisma } from "@/lib/prisma";
import {
  ErroDeNegocio,
  aplicarSaldo,
  arredondar,
  auditar,
  proximoNumero,
  registrarMovimento,
  type Tx,
} from "./nucleo";

export type SerialInformado = {
  serial: string;
  macAddress?: string | null;
  patrimonio?: string | null;
  codigoBarras?: string | null;
  lote?: string | null;
  estadoFisico?: string;
};

export type ItemDeEntrada = {
  materialId: string;
  quantidadePrevista: number;
  valorUnitario?: number | null;
  lote?: string | null;
  seriais?: SerialInformado[];
};

export type NovaEntrada = {
  tipo: string;
  destinoId: string;
  fornecedorId?: string | null;
  documento?: string | null;
  lote?: string | null;
  observacao?: string | null;
  itens: ItemDeEntrada[];
  /** 1.5 — permite lançar e conferir em um passo só quando não há conferência física */
  receberImediatamente?: boolean;
};

/**
 * 1.4 — NOVA ENTRADA.
 * A entrada nasce em AGUARDANDO RECEBIMENTO: nada entra no saldo antes da
 * conferência física (1.5).
 */
export async function criarEntrada(dados: NovaEntrada, usuarioId: string) {
  if (dados.itens.length === 0) {
    throw new ErroDeNegocio("Informe ao menos um material na entrada.");
  }

  const entradaId = await prisma.$transaction(async (tx) => {
    const numero = await proximoNumero(tx, "entrada");

    for (const item of dados.itens) {
      if (item.quantidadePrevista <= 0) {
        throw new ErroDeNegocio("A quantidade prevista deve ser maior que zero.");
      }
      const material = await tx.material.findUnique({
        where: { id: item.materialId },
        select: { controle: true, nome: true },
      });
      if (!material) throw new ErroDeNegocio("Material não encontrado.");

      if (material.controle === "SERIAL" && item.seriais?.length) {
        if (item.seriais.length !== item.quantidadePrevista) {
          throw new ErroDeNegocio(
            `"${material.nome}": foram informados ${item.seriais.length} seriais para ` +
              `${item.quantidadePrevista} unidades previstas.`,
          );
        }
        await validarSeriaisInexistentes(tx, item.seriais);
      }
    }

    const entrada = await tx.entrada.create({
      data: {
        numero,
        tipo: dados.tipo,
        status: "AGUARDANDO_RECEBIMENTO",
        destinoId: dados.destinoId,
        fornecedorId: dados.fornecedorId ?? null,
        documento: dados.documento ?? null,
        lote: dados.lote ?? null,
        observacao: dados.observacao ?? null,
        criadoPorId: usuarioId,
        itens: {
          create: dados.itens.map((item) => ({
            materialId: item.materialId,
            quantidadePrevista: item.quantidadePrevista,
            valorUnitario: item.valorUnitario ?? null,
            lote: item.lote ?? dados.lote ?? null,
            seriaisPrevistos: item.seriais?.length
              ? JSON.stringify(item.seriais)
              : null,
          })),
        },
      },
    });

    await auditar(tx, {
      entidade: "Entrada",
      entidadeId: entrada.id,
      acao: "CRIACAO",
      descricao: `Entrada ${numero} cadastrada (${dados.itens.length} item(ns)) aguardando recebimento.`,
      usuarioId,
      depois: { numero, tipo: dados.tipo, itens: dados.itens.length },
    });

    return entrada.id;
  });

  if (dados.receberImediatamente) {
    await receberEntrada({ entradaId, itens: [] }, usuarioId);
  }

  return entradaId;
}

export type ConferenciaItem = {
  itemId: string;
  quantidadeRecebida: number;
  /** 1.6 — obrigatório quando há divergência */
  motivo?: string | null;
  seriais?: SerialInformado[];
};

/**
 * 1.5 / 1.6 — RECEBIMENTO.
 * Só aqui o material passa a existir no saldo. Divergências ficam registradas
 * para sempre no histórico.
 */
export async function receberEntrada(
  dados: { entradaId: string; itens: ConferenciaItem[] },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const entrada = await tx.entrada.findUnique({
      where: { id: dados.entradaId },
      include: { itens: { include: { material: true } } },
    });
    if (!entrada) throw new ErroDeNegocio("Entrada não encontrada.");
    if (entrada.status === "RECEBIDO") {
      throw new ErroDeNegocio("Esta entrada já foi recebida.");
    }
    if (entrada.status === "CANCELADA") {
      throw new ErroDeNegocio("Esta entrada foi cancelada.");
    }

    const conferencias = new Map(dados.itens.map((i) => [i.itemId, i]));

    for (const item of entrada.itens) {
      const conferencia = conferencias.get(item.id);
      const recebida = arredondar(
        conferencia?.quantidadeRecebida ?? item.quantidadePrevista,
      );
      if (recebida < 0) {
        throw new ErroDeNegocio("A quantidade recebida não pode ser negativa.");
      }

      const diferenca = arredondar(recebida - item.quantidadePrevista);

      if (diferenca !== 0 && !conferencia?.motivo?.trim()) {
        throw new ErroDeNegocio(
          `Divergência em "${item.material.nome}" (previsto ${item.quantidadePrevista}, ` +
            `recebido ${recebida}). Informe o motivo.`,
        );
      }

      await tx.entradaItem.update({
        where: { id: item.id },
        data: { quantidadeRecebida: recebida },
      });

      // 1.6 — registro permanente da divergência
      if (diferenca !== 0) {
        await tx.divergencia.create({
          data: {
            entradaItemId: item.id,
            previsto: item.quantidadePrevista,
            recebido: recebida,
            diferenca,
            motivo: conferencia!.motivo!.trim(),
            usuarioId,
          },
        });
        await auditar(tx, {
          entidade: "Entrada",
          entidadeId: entrada.id,
          acao: "RECEBIMENTO",
          descricao:
            `Divergência em "${item.material.nome}": previsto ${item.quantidadePrevista}, ` +
            `recebido ${recebida} (${diferenca > 0 ? "+" : ""}${diferenca}).`,
          usuarioId,
          antes: { previsto: item.quantidadePrevista },
          depois: { recebido: recebida, motivo: conferencia!.motivo },
        });
      }

      if (recebida === 0) continue;

      // 1.3 — criação das unidades individuais
      if (item.material.controle === "SERIAL") {
        const previstos: SerialInformado[] = item.seriaisPrevistos
          ? JSON.parse(item.seriaisPrevistos)
          : [];
        const informados = conferencia?.seriais?.length
          ? conferencia.seriais
          : previstos.slice(0, recebida);

        if (informados.length !== recebida) {
          throw new ErroDeNegocio(
            `"${item.material.nome}" é serializado: informe ${recebida} serial(is) no recebimento.`,
          );
        }
        await validarSeriaisInexistentes(tx, informados);

        for (const serial of informados) {
          const unidade = await tx.unidadeSerial.create({
            data: {
              serial: serial.serial.trim(),
              macAddress: serial.macAddress?.trim() || null,
              patrimonio: serial.patrimonio?.trim() || null,
              codigoBarras: serial.codigoBarras?.trim() || null,
              lote: serial.lote ?? item.lote ?? null,
              estadoFisico: serial.estadoFisico ?? "NOVO",
              status: "DISPONIVEL",
              materialId: item.materialId,
              detentorId: entrada.destinoId,
              valorUnitario: item.valorUnitario,
              entradaItemId: item.id,
            },
          });
          await registrarMovimento(tx, {
            tipo: "ENTRADA",
            materialId: item.materialId,
            unidadeId: unidade.id,
            quantidade: 1,
            destinoId: entrada.destinoId,
            usuarioId,
            entradaId: entrada.id,
            valorUnitario: item.valorUnitario,
            observacao: `Entrada ${entrada.numero} — serial ${unidade.serial}`,
          });
        }
      } else {
        await registrarMovimento(tx, {
          tipo: "ENTRADA",
          materialId: item.materialId,
          quantidade: recebida,
          destinoId: entrada.destinoId,
          usuarioId,
          entradaId: entrada.id,
          valorUnitario: item.valorUnitario,
          observacao: `Entrada ${entrada.numero}`,
        });
      }

      await aplicarSaldo(tx, item.materialId, entrada.destinoId, recebida);
      await atualizarValorMedio(tx, item.materialId, recebida, item.valorUnitario);
    }

    const atualizada = await tx.entrada.update({
      where: { id: entrada.id },
      data: {
        status: "RECEBIDO",
        recebidoPorId: usuarioId,
        recebidoEm: new Date(),
      },
    });

    await auditar(tx, {
      entidade: "Entrada",
      entidadeId: entrada.id,
      acao: "RECEBIMENTO",
      descricao: `Entrada ${entrada.numero} recebida e disponibilizada no estoque.`,
      usuarioId,
      antes: { status: "AGUARDANDO_RECEBIMENTO" },
      depois: { status: "RECEBIDO" },
    });

    return atualizada;
  });
}

export async function cancelarEntrada(
  entradaId: string,
  motivo: string,
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const entrada = await tx.entrada.findUnique({ where: { id: entradaId } });
    if (!entrada) throw new ErroDeNegocio("Entrada não encontrada.");
    if (entrada.status === "RECEBIDO") {
      throw new ErroDeNegocio(
        "Entrada já recebida não pode ser cancelada. Use um ajuste de inventário.",
      );
    }
    const atualizada = await tx.entrada.update({
      where: { id: entradaId },
      data: { status: "CANCELADA", observacao: motivo },
    });
    await auditar(tx, {
      entidade: "Entrada",
      entidadeId: entradaId,
      acao: "EDICAO",
      descricao: `Entrada ${entrada.numero} cancelada: ${motivo}`,
      usuarioId,
      antes: { status: entrada.status },
      depois: { status: "CANCELADA" },
    });
    return atualizada;
  });
}

// ---------------------------------------------------------------------------

async function validarSeriaisInexistentes(tx: Tx, seriais: SerialInformado[]) {
  const valores = seriais.map((s) => s.serial.trim()).filter(Boolean);

  const duplicadosNaLista = valores.filter(
    (v, i) => valores.indexOf(v) !== i,
  );
  if (duplicadosNaLista.length) {
    throw new ErroDeNegocio(
      `Serial repetido na lista informada: ${[...new Set(duplicadosNaLista)].join(", ")}`,
    );
  }

  const existentes = await tx.unidadeSerial.findMany({
    where: { serial: { in: valores } },
    select: { serial: true },
  });
  if (existentes.length) {
    throw new ErroDeNegocio(
      `Serial já cadastrado no sistema: ${existentes.map((e) => e.serial).join(", ")}`,
    );
  }
}

/** 1.2 — valor médio ponderado, recalculado a cada recebimento com valor. */
async function atualizarValorMedio(
  tx: Tx,
  materialId: string,
  quantidadeEntrada: number,
  valorUnitario?: number | null,
) {
  if (!valorUnitario || valorUnitario <= 0) return;

  const material = await tx.material.findUnique({
    where: { id: materialId },
    select: { valorMedio: true },
  });
  if (!material) return;

  const saldos = await tx.saldo.aggregate({
    where: { materialId },
    _sum: { quantidade: true },
  });
  const totalDepois = saldos._sum.quantidade ?? 0;
  const totalAntes = arredondar(totalDepois - quantidadeEntrada);

  const novoValor =
    totalDepois <= 0
      ? valorUnitario
      : (material.valorMedio * Math.max(totalAntes, 0) +
          valorUnitario * quantidadeEntrada) /
        totalDepois;

  await tx.material.update({
    where: { id: materialId },
    data: { valorMedio: arredondar(novoValor) },
  });
}
