import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { FINALIDADE, TIPO_MOVIMENTACAO } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** 1.7 / 1.10 / 1.11 — todo movimento de material, com origem, destino e autor. */
export default async function Movimentacoes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; detentor?: string }>;
}) {
  const filtros = await searchParams;

  const where = {
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
    ...(filtros.detentor
      ? {
          OR: [{ origemId: filtros.detentor }, { destinoId: filtros.detentor }],
        }
      : {}),
  };

  const [movimentacoes, detentores] = await Promise.all([
    prisma.movimentacao.findMany({
      where,
      include: {
        origem: true,
        destino: true,
        responsavel: { select: { nome: true } },
        solicitante: { select: { nome: true } },
        itens: { include: { material: { select: { nome: true } } } },
      },
      orderBy: { criadoEm: "desc" },
      take: 100,
    }),
    prisma.detentor.findMany({ orderBy: [{ tipo: "asc" }, { nome: "asc" }] }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Saídas e transferências"
        descricao="Estoque, técnico ou equipe — tirar de um e entregar a outro é sempre a mesma operação, sempre registrada."
        acoes={
          <BotaoLink href="/movimentacoes/nova" variante="primario">
            <ArrowLeftRight className="size-4" /> Nova movimentação
          </BotaoLink>
        }
      />

      <Cartao className="mb-4">
        <form className="grid gap-3 sm:grid-cols-3">
          <select name="tipo" defaultValue={filtros.tipo ?? ""}>
            <option value="">Todos os tipos</option>
            {TIPO_MOVIMENTACAO.opcoes.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <select name="detentor" defaultValue={filtros.detentor ?? ""}>
            <option value="">Qualquer origem ou destino</option>
            {detentores.map((detentor) => (
              <option key={detentor.id} value={detentor.id}>
                {detentor.nome}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--acento)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Filtrar
            </button>
            {(filtros.tipo || filtros.detentor) && (
              <Link
                href="/movimentacoes"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
              >
                Limpar
              </Link>
            )}
          </div>
        </form>
      </Cartao>

      <Cartao titulo={`${numero(movimentacoes.length)} movimentação(ões)`} semPadding>
        {movimentacoes.length === 0 ? (
          <Vazio titulo="Nenhuma movimentação encontrada" />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Tipo</Th>
                <Th>Origem → Destino</Th>
                <Th>Materiais</Th>
                <Th>Responsável</Th>
                <Th>Data</Th>
              </tr>
            </thead>
            <tbody>
              {movimentacoes.map((movimentacao) => (
                <Linha key={movimentacao.id}>
                  <Td>
                    <Link
                      href={`/movimentacoes/${movimentacao.id}`}
                      className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                    >
                      {movimentacao.numero}
                    </Link>
                  </Td>
                  <Td>
                    <Etiqueta tom={TIPO_MOVIMENTACAO.tom(movimentacao.tipo)}>
                      {TIPO_MOVIMENTACAO.rotulo(movimentacao.tipo)}
                    </Etiqueta>
                    <span className="mt-0.5 block text-[11px] text-[var(--texto-3)]">
                      {FINALIDADE.rotulo(movimentacao.finalidade)}
                    </span>
                  </Td>
                  <Td className="text-sm">
                    {movimentacao.origem ? (
                      <Link
                        href={`/locais/${movimentacao.origemId}`}
                        className="hover:text-[var(--acento)]"
                      >
                        {movimentacao.origem.nome}
                      </Link>
                    ) : (
                      <span className="text-[var(--texto-3)]">externo</span>
                    )}
                    <span className="mx-1.5 text-[var(--texto-3)]">→</span>
                    {movimentacao.destino ? (
                      <Link
                        href={`/locais/${movimentacao.destinoId}`}
                        className="hover:text-[var(--acento)]"
                      >
                        {movimentacao.destino.nome}
                      </Link>
                    ) : (
                      <span className="text-[var(--texto-3)]">
                        {movimentacao.finalidade === "INSTALACAO"
                          ? "cliente"
                          : "fora do estoque"}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-xs text-sm">
                    <span className="block truncate">
                      {movimentacao.itens
                        .map(
                          (item) =>
                            `${numero(item.quantidade, 2)}× ${item.material.nome}`,
                        )
                        .join(", ")}
                    </span>
                  </Td>
                  <Td className="text-sm">
                    {movimentacao.responsavel.nome}
                    {movimentacao.solicitante && (
                      <span className="block text-xs text-[var(--texto-3)]">
                        solic. {movimentacao.solicitante.nome}
                      </span>
                    )}
                  </Td>
                  <Td className="text-xs text-[var(--texto-3)]">
                    {dataHora(movimentacao.criadoEm)}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
