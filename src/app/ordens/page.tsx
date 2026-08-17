import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { listarOrdensComMaterial } from "@/lib/servicos/ordens";
import { data, moeda, normalizar, numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Linha,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * 1.34 — MATERIAL POR ORDEM DE SERVIÇO.
 *
 * O estoque não sincroniza com o SGP: guarda apenas o número da OS, o cliente
 * e o que foi usado. É o suficiente para responder quanto custou cada
 * atendimento e o que cada técnico aplicou.
 */
export default async function Ordens({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  const [ordens, totalOrdens] = await Promise.all([
    listarOrdensComMaterial(200),
    prisma.ordemServico.count(),
  ]);

  const termo = q ? normalizar(q) : "";
  const lista = termo
    ? ordens.filter((o) =>
        normalizar(`${o.numero} ${o.cliente ?? ""} ${o.resumo}`).includes(termo),
      )
    : ordens;

  const valorTotal = lista.reduce((s, o) => s + o.valor, 0);
  const semCliente = lista.filter((o) => !o.cliente).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Ordens de serviço"
        descricao="Material aplicado em cada atendimento. Só o essencial fica aqui — número da OS, cliente e itens usados; o resto continua no SGP."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="OS com material" valor={numero(lista.length)} />
        <Metrica rotulo="OS registradas" valor={numero(totalOrdens)} />
        <Metrica
          rotulo="Valor aplicado"
          valor={moeda(valorTotal)}
          tom="informativo"
        />
        <Metrica
          rotulo="Sem cliente informado"
          valor={numero(semCliente)}
          tom={semCliente > 0 ? "atencao" : "neutro"}
        />
      </div>

      <Cartao className="mb-4">
        <form className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Número da OS, cliente ou material"
            className="min-w-56 flex-1"
          />
          <button
            type="submit"
            className="rounded-lg bg-[var(--acento)] px-3 py-1.5 text-sm font-medium text-white"
          >
            Buscar
          </button>
          {q && (
            <Link
              href="/ordens"
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
            >
              Limpar
            </Link>
          )}
        </form>
      </Cartao>

      <Cartao titulo={`${numero(lista.length)} ordem(ns) com material aplicado`} semPadding>
        {lista.length === 0 ? (
          <Vazio
            titulo="Nenhuma OS com material registrado"
            descricao="Ao lançar uma saída com finalidade Ordem de Serviço ou Instalação, informe o número da OS — ela aparece aqui automaticamente."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>OS</Th>
                <Th>Cliente</Th>
                <Th>Materiais aplicados</Th>
                <Th numerico>Itens</Th>
                <Th numerico>Custo</Th>
                <Th>Data</Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((ordem) => (
                <Linha key={ordem.id}>
                  <Td>
                    <Link
                      href={`/ordens/${ordem.id}`}
                      className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                    >
                      {ordem.numero}
                    </Link>
                    <span className="block text-xs text-[var(--texto-3)]">
                      {ordem.movimentacoes} movimentação(ões)
                    </span>
                  </Td>
                  <Td className="text-sm">
                    {ordem.cliente ?? (
                      <span className="text-[var(--texto-3)]">não informado</span>
                    )}
                    {ordem.tecnico && (
                      <span className="block text-xs text-[var(--texto-3)]">
                        {ordem.tecnico}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-sm text-sm">
                    <span className="block truncate">{ordem.resumo}</span>
                  </Td>
                  <Td numerico>{numero(ordem.totalItens, 2)}</Td>
                  <Td numerico className="font-medium">
                    {moeda(ordem.valor)}
                  </Td>
                  <Td className="text-xs text-[var(--texto-3)]">
                    {data(ordem.abertaEm)}
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
