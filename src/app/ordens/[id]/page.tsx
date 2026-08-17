import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TIPO_MOVIMENTACAO } from "@/lib/dominio";
import { materiaisDaOrdem } from "@/lib/servicos/ordens";
import { dataHora, moeda, numero, quantidade } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  ListaDefinicoes,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** 1.34 — previsto × retirado × utilizado × devolvido, no nível que temos hoje. */
export default async function FichaOrdem({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ordem = await prisma.ordemServico.findUnique({
    where: { id },
    include: { tecnico: true, equipe: true },
  });
  if (!ordem) notFound();

  const { movimentacoes, consolidado, valorTotal } = await materiaisDaOrdem(id);

  const totalUsado = consolidado.reduce((s, i) => s + i.usado, 0);
  const totalDevolvido = consolidado.reduce((s, i) => s + i.devolvido, 0);

  return (
    <>
      <CabecalhoPagina
        titulo={`OS ${ordem.numero}`}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            {ordem.cliente ? (
              <span className="text-sm">{ordem.cliente}</span>
            ) : (
              <span className="text-sm text-[var(--texto-3)]">
                cliente não informado
              </span>
            )}
            {ordem.origem === "LANCAMENTO_MANUAL" && (
              <Etiqueta tom="neutro">registrada pelo estoque</Etiqueta>
            )}
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Materiais distintos" valor={numero(consolidado.length)} />
        <Metrica rotulo="Itens utilizados" valor={numero(totalUsado, 2)} />
        <Metrica
          rotulo="Itens devolvidos"
          valor={numero(totalDevolvido, 2)}
          tom={totalDevolvido > 0 ? "roxo" : "neutro"}
        />
        <Metrica
          rotulo="Custo de material"
          valor={moeda(valorTotal)}
          tom="informativo"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao
            titulo="Material aplicado nesta OS"
            descricao="Consolidado de todas as movimentações vinculadas"
            semPadding
          >
            {consolidado.length === 0 ? (
              <Vazio titulo="Nenhum material vinculado a esta OS" />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th numerico>Utilizado</Th>
                    <Th numerico>Devolvido</Th>
                    <Th>Seriais</Th>
                    <Th numerico>Custo</Th>
                  </tr>
                </thead>
                <tbody>
                  {consolidado.map((item) => (
                    <Linha key={item.materialId}>
                      <Td>
                        <Link
                          href={`/materiais/${item.materialId}`}
                          className="font-medium hover:text-[var(--acento)]"
                        >
                          {item.nome}
                        </Link>
                      </Td>
                      <Td numerico className="font-medium">
                        {quantidade(item.usado, item.unidadeMedida)}
                      </Td>
                      <Td numerico>
                        {item.devolvido > 0 ? (
                          <span className="text-[var(--roxo)]">
                            {numero(item.devolvido, 2)}
                          </span>
                        ) : (
                          <span className="text-[var(--texto-3)]">—</span>
                        )}
                      </Td>
                      <Td>
                        {item.seriais.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {item.seriais.slice(0, 4).map((serial) => (
                              <span
                                key={serial}
                                className="rounded bg-[var(--superficie-3)] px-1.5 py-0.5 font-mono text-[11px]"
                              >
                                {serial}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-[var(--texto-3)]">—</span>
                        )}
                      </Td>
                      <Td numerico>{moeda(item.valor)}</Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Cartao>

          <Cartao titulo="Movimentações vinculadas" semPadding>
            {movimentacoes.length === 0 ? (
              <Vazio titulo="Nenhuma movimentação" />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {movimentacoes.map((movimentacao) => (
                  <li key={movimentacao.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/movimentacoes/${movimentacao.id}`}
                        className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                      >
                        {movimentacao.numero}
                      </Link>
                      <Etiqueta tom={TIPO_MOVIMENTACAO.tom(movimentacao.tipo)}>
                        {TIPO_MOVIMENTACAO.rotulo(movimentacao.tipo)}
                      </Etiqueta>
                      <span className="ml-auto text-xs text-[var(--texto-3)]">
                        {dataHora(movimentacao.criadoEm)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--texto-2)]">
                      {movimentacao.origem?.nome ?? "externo"}
                      <span className="mx-1.5 text-[var(--texto-3)]">→</span>
                      {movimentacao.destino?.nome ?? "cliente"}
                      {" · "}
                      {movimentacao.itens
                        .map(
                          (item) =>
                            `${numero(item.quantidade, 2)}× ${item.material.nome}`,
                        )
                        .join(", ")}
                    </p>
                    <p className="text-xs text-[var(--texto-3)]">
                      por {movimentacao.responsavel.nome}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>

        <Cartao titulo="Dados da OS">
          <ListaDefinicoes
            colunas={1}
            itens={[
              { rotulo: "Número", valor: ordem.numero },
              { rotulo: "Cliente", valor: ordem.cliente ?? "—" },
              { rotulo: "Código do cliente", valor: ordem.codigoCliente ?? "—" },
              { rotulo: "Técnico", valor: ordem.tecnico?.nome ?? "—" },
              { rotulo: "Equipe", valor: ordem.equipe?.nome ?? "—" },
              { rotulo: "Status", valor: ordem.status },
              { rotulo: "Origem do registro", valor: ordem.origem },
              { rotulo: "Registrada em", valor: dataHora(ordem.abertaEm) },
            ]}
          />
          <p className="mt-3 border-t border-[var(--borda)] pt-3 text-xs text-[var(--texto-3)]">
            Tipo, severidade, SLA e endereço permanecem no SGP. Aqui guardamos
            apenas o vínculo necessário para saber o que foi consumido.
          </p>
        </Cartao>
      </div>
    </>
  );
}
