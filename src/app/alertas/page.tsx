import Link from "next/link";
import { alertasDoEstoque, type Alerta } from "@/lib/servicos/alertas";
import { numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

const CATEGORIAS: Record<Alerta["categoria"], string> = {
  SEM_ESTOQUE: "Sem estoque",
  ESTOQUE_MINIMO: "Abaixo do mínimo",
  CONSUMO: "Consumo fora do padrão",
  MATERIAL_PARADO: "Material parado",
  DEVOLUCAO: "Aguardando devolução",
  TRIAGEM: "Triagem pendente",
  RECEBIMENTO: "Recebimento pendente",
  RESERVA: "Reservas",
};

/** 1.17 — central de alertas, calculada a partir do estado atual do estoque. */
export default async function Alertas({
  searchParams,
}: {
  searchParams: Promise<{ severidade?: string; categoria?: string }>;
}) {
  const filtros = await searchParams;
  const todos = await alertasDoEstoque();

  const lista = todos.filter((alerta) => {
    if (filtros.severidade && alerta.severidade !== filtros.severidade) return false;
    if (filtros.categoria && alerta.categoria !== filtros.categoria) return false;
    return true;
  });

  const criticos = todos.filter((a) => a.severidade === "CRITICO").length;
  const atencao = todos.filter((a) => a.severidade === "ATENCAO").length;
  const info = todos.filter((a) => a.severidade === "INFO").length;

  const porCategoria = todos.reduce<Record<string, number>>((mapa, alerta) => {
    mapa[alerta.categoria] = (mapa[alerta.categoria] ?? 0) + 1;
    return mapa;
  }, {});

  return (
    <>
      <CabecalhoPagina
        titulo="Alertas"
        descricao="Calculados a partir do estado atual — um alerta desaparece sozinho assim que o problema é resolvido."
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Metrica
          rotulo="Críticos"
          valor={numero(criticos)}
          tom={criticos > 0 ? "critico" : "neutro"}
          href="/alertas?severidade=CRITICO"
        />
        <Metrica
          rotulo="Atenção"
          valor={numero(atencao)}
          tom={atencao > 0 ? "atencao" : "neutro"}
          href="/alertas?severidade=ATENCAO"
        />
        <Metrica
          rotulo="Informativos"
          valor={numero(info)}
          tom="informativo"
          href="/alertas?severidade=INFO"
        />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/alertas"
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            !filtros.categoria && !filtros.severidade
              ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
              : "bg-[var(--superficie)] text-[var(--texto-2)]"
          }`}
        >
          Todos {todos.length}
        </Link>
        {Object.entries(porCategoria)
          .sort((a, b) => b[1] - a[1])
          .map(([categoria, total]) => (
            <Link
              key={categoria}
              href={`/alertas?categoria=${categoria}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filtros.categoria === categoria
                  ? "bg-[var(--acento-suave)] text-[var(--acento-texto)]"
                  : "bg-[var(--superficie)] text-[var(--texto-2)]"
              }`}
            >
              {CATEGORIAS[categoria as Alerta["categoria"]]} {total}
            </Link>
          ))}
      </div>

      <Cartao titulo={`${numero(lista.length)} alerta(s)`} semPadding>
        {lista.length === 0 ? (
          <Vazio
            titulo="Nenhum alerta aberto"
            descricao="Nenhum material abaixo do mínimo, devolução pendente, triagem parada ou consumo fora do padrão."
          />
        ) : (
          <ul className="divide-y divide-[var(--borda)]">
            {lista.map((alerta) => {
              const conteudo = (
                <>
                  <div className="flex shrink-0 flex-col items-start gap-1.5">
                    <Etiqueta
                      tom={
                        alerta.severidade === "CRITICO"
                          ? "critico"
                          : alerta.severidade === "ATENCAO"
                            ? "atencao"
                            : "informativo"
                      }
                      ponto
                    >
                      {alerta.severidade === "CRITICO"
                        ? "Crítico"
                        : alerta.severidade === "ATENCAO"
                          ? "Atenção"
                          : "Info"}
                    </Etiqueta>
                    <span className="text-[10px] tracking-wide uppercase text-[var(--texto-3)]">
                      {CATEGORIAS[alerta.categoria]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{alerta.titulo}</p>
                    <p className="text-sm text-[var(--texto-2)]">{alerta.detalhe}</p>
                  </div>
                </>
              );

              return (
                <li key={alerta.id}>
                  {alerta.href ? (
                    <Link
                      href={alerta.href}
                      className="flex items-start gap-4 px-4 py-3 hover:bg-[var(--superficie-2)]"
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-4 px-4 py-3">{conteudo}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Cartao>
    </>
  );
}
