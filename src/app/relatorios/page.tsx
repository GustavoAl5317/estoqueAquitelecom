import Link from "next/link";
import { Download } from "lucide-react";
import { RELATORIOS, relatorioPorId } from "@/lib/servicos/relatorios";
import { numero } from "@/lib/utils";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Linha,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90, 180];

/** 1.30 — relatórios em tela, com exportação CSV. */
export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; dias?: string }>;
}) {
  const { r, dias } = await searchParams;

  const relatorio = relatorioPorId(r ?? "") ?? RELATORIOS[0];
  const periodo = PERIODOS.includes(Number(dias)) ? Number(dias) : 30;
  const { colunas, linhas } = await relatorio.carregar(periodo);

  const limite = 250;

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Recortes prontos da operação, exportáveis em CSV para planilha."
      />

      <div className="grid gap-4 lg:grid-cols-4">
        <nav className="lg:col-span-1">
          <Cartao titulo="Relatórios" semPadding>
            <ul className="py-1">
              {RELATORIOS.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/relatorios?r=${item.id}&dias=${periodo}`}
                    className={`block px-4 py-2 text-sm transition-colors ${
                      item.id === relatorio.id
                        ? "bg-[var(--acento-suave)] font-medium text-[var(--acento-texto)]"
                        : "text-[var(--texto-2)] hover:bg-[var(--superficie-2)]"
                    }`}
                  >
                    {item.nome}
                  </Link>
                </li>
              ))}
            </ul>
          </Cartao>
        </nav>

        <div className="lg:col-span-3">
          <Cartao
            titulo={relatorio.nome}
            descricao={relatorio.descricao}
            acoes={
              <BotaoLink
                href={`/relatorios/csv?r=${relatorio.id}&dias=${periodo}`}
                variante="secundario"
              >
                <Download className="size-4" /> CSV
              </BotaoLink>
            }
            semPadding
          >
            {relatorio.periodo && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--borda)] px-4 py-2.5">
                <span className="mr-1 text-xs text-[var(--texto-3)]">Período:</span>
                {PERIODOS.map((valor) => (
                  <Link
                    key={valor}
                    href={`/relatorios?r=${relatorio.id}&dias=${valor}`}
                    className={`rounded-md px-2 py-1 text-xs font-medium ${
                      valor === periodo
                        ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
                        : "text-[var(--texto-3)] hover:text-[var(--texto)]"
                    }`}
                  >
                    {valor} dias
                  </Link>
                ))}
              </div>
            )}

            {linhas.length === 0 ? (
              <Vazio
                titulo="Nenhum registro no recorte"
                descricao="Ajuste o período ou escolha outro relatório."
              />
            ) : (
              <>
                <Tabela>
                  <thead>
                    <tr>
                      {colunas.map((coluna) => (
                        <Th key={coluna}>{coluna}</Th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, limite).map((linha, i) => (
                      <Linha key={i}>
                        {linha.map((celula, j) => (
                          <Td
                            key={j}
                            numerico={/^-?[\d.,]+$/.test(celula) && celula !== ""}
                          >
                            {celula || (
                              <span className="text-[var(--texto-3)]">—</span>
                            )}
                          </Td>
                        ))}
                      </Linha>
                    ))}
                  </tbody>
                </Tabela>

                <p className="border-t border-[var(--borda)] px-4 py-2.5 text-xs text-[var(--texto-3)]">
                  {linhas.length > limite
                    ? `Exibindo ${limite} de ${numero(linhas.length)} linhas — o CSV traz tudo.`
                    : `${numero(linhas.length)} linha(s).`}
                </p>
              </>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
