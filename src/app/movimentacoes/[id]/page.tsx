import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  FINALIDADE,
  STATUS_TRIAGEM,
  TIPO_MOVIMENTACAO,
} from "@/lib/dominio";
import { dataHora, moeda, numero, quantidade } from "@/lib/utils";
import {
  Aviso,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  ListaDefinicoes,
  Tabela,
  Td,
  Th,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function FichaMovimentacao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const movimentacao = await prisma.movimentacao.findUnique({
    where: { id },
    include: {
      origem: true,
      destino: true,
      responsavel: { select: { nome: true } },
      solicitante: { select: { nome: true } },
      itens: {
        include: {
          material: true,
          seriais: { include: { unidade: true } },
        },
      },
      triagens: { include: { material: true, unidade: true } },
    },
  });
  if (!movimentacao) notFound();

  const valorTotal = movimentacao.itens.reduce(
    (soma, item) => soma + item.quantidade * (item.valorUnitario ?? 0),
    0,
  );

  return (
    <>
      <CabecalhoPagina
        titulo={movimentacao.numero}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Etiqueta tom={TIPO_MOVIMENTACAO.tom(movimentacao.tipo)}>
              {TIPO_MOVIMENTACAO.rotulo(movimentacao.tipo)}
            </Etiqueta>
            <Etiqueta tom="neutro">
              {FINALIDADE.rotulo(movimentacao.finalidade)}
            </Etiqueta>
            <span className="text-sm">
              {movimentacao.origem?.nome ?? "externo"}
              <span className="mx-1.5 text-[var(--texto-3)]">→</span>
              {movimentacao.destino?.nome ??
                (movimentacao.finalidade === "INSTALACAO"
                  ? "cliente"
                  : "fora do estoque")}
            </span>
          </span>
        }
      />

      {movimentacao.triagens.length > 0 && (
        <div className="mb-4">
          <Aviso tom="roxo" titulo="Material encaminhado para triagem">
            {movimentacao.triagens.length} item(ns) desta devolução aguardam laudo
            antes de voltar ao estoque disponível.{" "}
            <Link href="/triagem" className="font-medium underline">
              Abrir triagem
            </Link>
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Itens movimentados" semPadding>
            <Tabela>
              <thead>
                <tr>
                  <Th>Material</Th>
                  <Th numerico>Quantidade</Th>
                  <Th>Estado</Th>
                  <Th numerico>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {movimentacao.itens.map((item) => (
                  <Linha key={item.id}>
                    <Td>
                      <Link
                        href={`/materiais/${item.materialId}`}
                        className="font-medium hover:text-[var(--acento)]"
                      >
                        {item.material.nome}
                      </Link>
                      {item.seriais.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.seriais.map((vinculo) => (
                            <Link
                              key={vinculo.id}
                              href={`/seriais/${vinculo.unidadeId}`}
                              className="rounded bg-[var(--superficie-3)] px-1.5 py-0.5 font-mono text-[11px] hover:text-[var(--acento)]"
                            >
                              {vinculo.unidade.serial}
                            </Link>
                          ))}
                        </span>
                      )}
                    </Td>
                    <Td numerico className="font-medium">
                      {quantidade(item.quantidade, item.material.unidadeMedida)}
                    </Td>
                    <Td>
                      {item.estadoFisico ? (
                        <Etiqueta tom={ESTADO_FISICO.tom(item.estadoFisico)}>
                          {ESTADO_FISICO.rotulo(item.estadoFisico)}
                        </Etiqueta>
                      ) : (
                        <span className="text-[var(--texto-3)]">—</span>
                      )}
                    </Td>
                    <Td numerico>
                      {item.valorUnitario
                        ? moeda(item.quantidade * item.valorUnitario)
                        : "—"}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          </Cartao>

          {movimentacao.triagens.length > 0 && (
            <Cartao titulo="Itens em triagem" semPadding>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Serial</Th>
                    <Th>Estado recebido</Th>
                    <Th>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {movimentacao.triagens.map((triagem) => (
                    <Linha key={triagem.id}>
                      <Td className="text-sm">{triagem.material.nome}</Td>
                      <Td className="font-mono text-xs">
                        {triagem.unidade?.serial ?? "—"}
                      </Td>
                      <Td>
                        {triagem.estadoRecebido && (
                          <Etiqueta tom={ESTADO_FISICO.tom(triagem.estadoRecebido)}>
                            {ESTADO_FISICO.rotulo(triagem.estadoRecebido)}
                          </Etiqueta>
                        )}
                      </Td>
                      <Td>
                        <Etiqueta tom={STATUS_TRIAGEM.tom(triagem.status)} ponto>
                          {triagem.resultado ?? STATUS_TRIAGEM.rotulo(triagem.status)}
                        </Etiqueta>
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </Cartao>
          )}
        </div>

        <Cartao titulo="Dados da movimentação">
          <ListaDefinicoes
            colunas={1}
            itens={[
              { rotulo: "Número", valor: movimentacao.numero },
              {
                rotulo: "Tipo",
                valor: TIPO_MOVIMENTACAO.rotulo(movimentacao.tipo),
              },
              {
                rotulo: "Finalidade",
                valor: FINALIDADE.rotulo(movimentacao.finalidade),
              },
              {
                rotulo: "Origem",
                valor: movimentacao.origem ? (
                  <Link
                    href={`/locais/${movimentacao.origemId}`}
                    className="hover:text-[var(--acento)]"
                  >
                    {movimentacao.origem.nome}
                  </Link>
                ) : (
                  "—"
                ),
              },
              {
                rotulo: "Destino",
                valor: movimentacao.destino ? (
                  <Link
                    href={`/locais/${movimentacao.destinoId}`}
                    className="hover:text-[var(--acento)]"
                  >
                    {movimentacao.destino.nome}
                  </Link>
                ) : movimentacao.finalidade === "INSTALACAO" ? (
                  "Cliente"
                ) : (
                  "Fora do estoque"
                ),
              },
              { rotulo: "Responsável", valor: movimentacao.responsavel.nome },
              {
                rotulo: "Solicitante",
                valor: movimentacao.solicitante?.nome ?? "—",
              },
              { rotulo: "Data", valor: dataHora(movimentacao.criadoEm) },
              {
                rotulo: "Itens",
                valor: `${movimentacao.itens.length} · ${numero(
                  movimentacao.itens.reduce((s, i) => s + i.quantidade, 0),
                  2,
                )} unidades`,
              },
              {
                rotulo: "Valor movimentado",
                valor: valorTotal > 0 ? moeda(valorTotal) : "—",
              },
            ]}
          />
          {(movimentacao.motivo || movimentacao.observacao) && (
            <div className="mt-3 space-y-1 border-t border-[var(--borda)] pt-3 text-sm">
              {movimentacao.motivo && (
                <p>
                  <span className="text-[var(--texto-3)]">Motivo: </span>
                  {movimentacao.motivo}
                </p>
              )}
              {movimentacao.observacao && (
                <p className="text-[var(--texto-2)]">{movimentacao.observacao}</p>
              )}
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
