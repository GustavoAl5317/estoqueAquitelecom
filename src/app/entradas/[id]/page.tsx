import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STATUS_ENTRADA, TIPO_ENTRADA } from "@/lib/dominio";
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
import { FormularioConferencia } from "@/components/formulario-conferencia";

export const dynamic = "force-dynamic";

/** 1.5 / 1.6 — conferência do recebimento e registro de divergência. */
export default async function FichaEntrada({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const entrada = await prisma.entrada.findUnique({
    where: { id },
    include: {
      destino: true,
      fornecedor: true,
      criadoPor: { select: { nome: true } },
      recebidoPor: { select: { nome: true } },
      itens: {
        include: {
          material: true,
          divergencia: { include: { usuario: { select: { nome: true } } } },
          seriais: true,
        },
      },
    },
  });
  if (!entrada) notFound();

  const aguardando = entrada.status === "AGUARDANDO_RECEBIMENTO";

  const totalPrevisto = entrada.itens.reduce(
    (soma, item) => soma + item.quantidadePrevista * (item.valorUnitario ?? 0),
    0,
  );
  const totalRecebido = entrada.itens.reduce(
    (soma, item) => soma + (item.quantidadeRecebida ?? 0) * (item.valorUnitario ?? 0),
    0,
  );
  const divergencias = entrada.itens.filter((i) => i.divergencia);

  return (
    <>
      <CabecalhoPagina
        titulo={entrada.numero}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Etiqueta tom={TIPO_ENTRADA.tom(entrada.tipo)}>
              {TIPO_ENTRADA.rotulo(entrada.tipo)}
            </Etiqueta>
            <Etiqueta tom={STATUS_ENTRADA.tom(entrada.status)} ponto>
              {STATUS_ENTRADA.rotulo(entrada.status)}
            </Etiqueta>
            <span className="text-sm">
              destino{" "}
              <Link
                href={`/locais/${entrada.destinoId}`}
                className="hover:text-[var(--acento)]"
              >
                {entrada.destino.nome}
              </Link>
            </span>
          </span>
        }
      />

      {aguardando && (
        <div className="mb-4">
          <Aviso tom="atencao" titulo="Aguardando conferência física">
            O material desta entrada ainda não conta como disponível no estoque.
            Confirme abaixo as quantidades realmente recebidas.
          </Aviso>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {aguardando ? (
            <Cartao
              titulo="Conferência de recebimento"
              descricao="Ajuste a quantidade quando ela for diferente da prevista — a divergência exige motivo e fica registrada para sempre."
            >
              <FormularioConferencia
                entradaId={entrada.id}
                itens={entrada.itens.map((item) => ({
                  id: item.id,
                  materialNome: item.material.nome,
                  unidadeMedida: item.material.unidadeMedida,
                  controle: item.material.controle,
                  quantidadePrevista: item.quantidadePrevista,
                  seriaisPrevistos: item.seriaisPrevistos
                    ? (JSON.parse(item.seriaisPrevistos) as { serial: string }[]).map(
                        (s) => s.serial,
                      )
                    : [],
                }))}
              />
            </Cartao>
          ) : (
            <Cartao titulo="Itens recebidos" semPadding>
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th numerico>Previsto</Th>
                    <Th numerico>Recebido</Th>
                    <Th numerico>Diferença</Th>
                    <Th numerico>Valor unit.</Th>
                  </tr>
                </thead>
                <tbody>
                  {entrada.itens.map((item) => {
                    const recebido = item.quantidadeRecebida ?? 0;
                    const diferenca = recebido - item.quantidadePrevista;
                    return (
                      <Linha key={item.id}>
                        <Td>
                          <Link
                            href={`/materiais/${item.materialId}`}
                            className="font-medium hover:text-[var(--acento)]"
                          >
                            {item.material.nome}
                          </Link>
                          {item.seriais.length > 0 && (
                            <span className="block text-xs text-[var(--texto-3)]">
                              {item.seriais.length} serial(is) cadastrado(s)
                            </span>
                          )}
                        </Td>
                        <Td numerico>
                          {quantidade(
                            item.quantidadePrevista,
                            item.material.unidadeMedida,
                          )}
                        </Td>
                        <Td numerico className="font-medium">
                          {quantidade(recebido, item.material.unidadeMedida)}
                        </Td>
                        <Td numerico>
                          {diferenca === 0 ? (
                            <span className="text-[var(--texto-3)]">—</span>
                          ) : (
                            <span
                              style={{
                                color:
                                  diferenca < 0
                                    ? "var(--critico)"
                                    : "var(--positivo)",
                              }}
                            >
                              {diferenca > 0 ? "+" : ""}
                              {numero(diferenca, 2)}
                            </span>
                          )}
                        </Td>
                        <Td numerico>
                          {item.valorUnitario ? moeda(item.valorUnitario) : "—"}
                        </Td>
                      </Linha>
                    );
                  })}
                </tbody>
              </Tabela>
            </Cartao>
          )}

          {/* 1.6 — registro permanente */}
          {divergencias.length > 0 && (
            <Cartao
              titulo="Divergências registradas"
              descricao="Permanecem no histórico da entrada"
            >
              <ul className="space-y-3">
                {divergencias.map((item) => (
                  <li
                    key={item.id}
                    className="border-l-2 border-[var(--critico)] pl-3"
                  >
                    <p className="text-sm font-medium">{item.material.nome}</p>
                    <p className="tabular text-sm text-[var(--texto-2)]">
                      Previsto {numero(item.divergencia!.previsto, 2)} · Recebido{" "}
                      {numero(item.divergencia!.recebido, 2)} · Divergência{" "}
                      <span
                        style={{
                          color:
                            item.divergencia!.diferenca < 0
                              ? "var(--critico)"
                              : "var(--positivo)",
                        }}
                      >
                        {item.divergencia!.diferenca > 0 ? "+" : ""}
                        {numero(item.divergencia!.diferenca, 2)}
                      </span>
                    </p>
                    <p className="mt-0.5 text-sm">{item.divergencia!.motivo}</p>
                    <p className="text-xs text-[var(--texto-3)]">
                      {item.divergencia!.usuario.nome} ·{" "}
                      {dataHora(item.divergencia!.criadoEm)}
                    </p>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>

        <div className="space-y-4">
          <Cartao titulo="Dados da entrada">
            <ListaDefinicoes
              colunas={1}
              itens={[
                { rotulo: "Número", valor: entrada.numero },
                { rotulo: "Tipo", valor: TIPO_ENTRADA.rotulo(entrada.tipo) },
                { rotulo: "Fornecedor", valor: entrada.fornecedor?.nome ?? "—" },
                { rotulo: "Documento", valor: entrada.documento ?? "—" },
                { rotulo: "Lote", valor: entrada.lote ?? "—" },
                {
                  rotulo: "Valor previsto",
                  valor: totalPrevisto > 0 ? moeda(totalPrevisto) : "—",
                },
                {
                  rotulo: "Valor recebido",
                  valor: totalRecebido > 0 ? moeda(totalRecebido) : "—",
                },
                {
                  rotulo: "Lançada por",
                  valor: `${entrada.criadoPor.nome} · ${dataHora(entrada.criadoEm)}`,
                },
                {
                  rotulo: "Recebida por",
                  valor: entrada.recebidoPor
                    ? `${entrada.recebidoPor.nome} · ${dataHora(entrada.recebidoEm)}`
                    : "—",
                },
              ]}
            />
            {entrada.observacao && (
              <p className="mt-3 border-t border-[var(--borda)] pt-3 text-sm text-[var(--texto-2)]">
                {entrada.observacao}
              </p>
            )}
          </Cartao>

          <Cartao titulo="Fluxo">
            <ol className="space-y-2 text-sm">
              {[
                { rotulo: "Entrada cadastrada", feito: true },
                { rotulo: "Aguardando recebimento", feito: true },
                { rotulo: "Conferência", feito: !aguardando },
                { rotulo: "Recebido", feito: entrada.status === "RECEBIDO" },
                {
                  rotulo: "Disponível no estoque",
                  feito: entrada.status === "RECEBIDO",
                },
              ].map((etapa) => (
                <li key={etapa.rotulo} className="flex items-center gap-2.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background: etapa.feito
                        ? "var(--positivo)"
                        : "var(--borda-forte)",
                    }}
                  />
                  <span
                    className={
                      etapa.feito ? "" : "text-[var(--texto-3)]"
                    }
                  >
                    {etapa.rotulo}
                  </span>
                </li>
              ))}
            </ol>
          </Cartao>
        </div>
      </div>
    </>
  );
}
