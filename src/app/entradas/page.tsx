import Link from "next/link";
import { PackagePlus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { STATUS_ENTRADA, TIPO_ENTRADA } from "@/lib/dominio";
import { data, moeda, numero } from "@/lib/utils";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/** 1.4 / 1.5 — entradas e o estado de recebimento de cada uma. */
export default async function Entradas({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; tipo?: string }>;
}) {
  const filtros = await searchParams;

  const where = {
    ...(filtros.status ? { status: filtros.status } : {}),
    ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
  };

  const [entradas, pendentes, recebidasMes] = await Promise.all([
    prisma.entrada.findMany({
      where,
      include: {
        destino: true,
        fornecedor: true,
        criadoPor: { select: { nome: true } },
        itens: { include: { divergencia: true } },
      },
      orderBy: { criadoEm: "desc" },
      take: 100,
    }),
    prisma.entrada.count({ where: { status: "AGUARDANDO_RECEBIMENTO" } }),
    prisma.entrada.count({
      where: {
        status: "RECEBIDO",
        recebidoEm: { gte: new Date(new Date().setDate(1)) },
      },
    }),
  ]);

  const comDivergencia = entradas.filter((e) =>
    e.itens.some((i) => i.divergencia),
  ).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Entradas"
        descricao="Nada entra no saldo antes da conferência física. Cada entrada nasce aguardando recebimento."
        acoes={
          <BotaoLink href="/entradas/nova" variante="primario">
            <PackagePlus className="size-4" /> Nova entrada
          </BotaoLink>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metrica
          rotulo="Aguardando recebimento"
          valor={numero(pendentes)}
          tom={pendentes > 0 ? "atencao" : "neutro"}
          detalhe="não contam como disponível"
          href="/entradas?status=AGUARDANDO_RECEBIMENTO"
        />
        <Metrica
          rotulo="Recebidas no mês"
          valor={numero(recebidasMes)}
          tom="positivo"
        />
        <Metrica
          rotulo="Com divergência"
          valor={numero(comDivergencia)}
          tom={comDivergencia > 0 ? "critico" : "neutro"}
          detalhe="registro permanente no histórico"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/entradas"
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !filtros.status
              ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
              : "bg-[var(--superficie)] text-[var(--texto-2)]"
          }`}
        >
          Todas
        </Link>
        {STATUS_ENTRADA.opcoes.map((opcao) => (
          <Link
            key={opcao.valor}
            href={`/entradas?status=${opcao.valor}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filtros.status === opcao.valor
                ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
                : "bg-[var(--superficie)] text-[var(--texto-2)]"
            }`}
          >
            {opcao.rotulo}
          </Link>
        ))}
      </div>

      <Cartao titulo={`${numero(entradas.length)} entrada(s)`} semPadding>
        {entradas.length === 0 ? (
          <Vazio
            titulo="Nenhuma entrada encontrada"
            acao={
              <BotaoLink href="/entradas/nova" variante="primario">
                Lançar entrada
              </BotaoLink>
            }
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>Número</Th>
                <Th>Tipo</Th>
                <Th>Destino</Th>
                <Th>Fornecedor / documento</Th>
                <Th numerico>Itens</Th>
                <Th numerico>Valor</Th>
                <Th>Status</Th>
                <Th>Data</Th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((entrada) => {
                const valor = entrada.itens.reduce(
                  (soma, item) =>
                    soma +
                    (item.quantidadeRecebida ?? item.quantidadePrevista) *
                      (item.valorUnitario ?? 0),
                  0,
                );
                const divergente = entrada.itens.some((i) => i.divergencia);

                return (
                  <Linha key={entrada.id}>
                    <Td>
                      <Link
                        href={`/entradas/${entrada.id}`}
                        className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                      >
                        {entrada.numero}
                      </Link>
                      {divergente && (
                        <span className="mt-0.5 block">
                          <Etiqueta tom="critico">divergência</Etiqueta>
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Etiqueta tom={TIPO_ENTRADA.tom(entrada.tipo)}>
                        {TIPO_ENTRADA.rotulo(entrada.tipo)}
                      </Etiqueta>
                    </Td>
                    <Td className="text-sm">
                      <Link
                        href={`/locais/${entrada.destinoId}`}
                        className="hover:text-[var(--acento)]"
                      >
                        {entrada.destino.nome}
                      </Link>
                    </Td>
                    <Td className="text-sm">
                      {entrada.fornecedor?.nome ?? "—"}
                      {entrada.documento && (
                        <span className="block text-xs text-[var(--texto-3)]">
                          {entrada.documento}
                        </span>
                      )}
                    </Td>
                    <Td numerico>{entrada.itens.length}</Td>
                    <Td numerico>{valor > 0 ? moeda(valor) : "—"}</Td>
                    <Td>
                      <Etiqueta tom={STATUS_ENTRADA.tom(entrada.status)} ponto>
                        {STATUS_ENTRADA.rotulo(entrada.status)}
                      </Etiqueta>
                    </Td>
                    <Td className="text-xs text-[var(--texto-3)]">
                      {data(entrada.criadoEm)}
                      <span className="block">{entrada.criadoPor.nome}</span>
                    </Td>
                  </Linha>
                );
              })}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  );
}
