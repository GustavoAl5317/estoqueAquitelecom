import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, type Tx } from "./nucleo";

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
