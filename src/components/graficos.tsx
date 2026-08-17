import { numero } from "@/lib/utils";

/**
 * 1.19 — ENTRADAS X SAÍDAS.
 * SVG puro: sem dependência de biblioteca de gráficos e legível nos dois temas.
 */
export function GraficoEntradasSaidas({
  dados,
  altura = 200,
}: {
  dados: { rotulo: string; entrada: number; saida: number }[];
  altura?: number;
}) {
  if (!dados.length) return null;

  const maximo = Math.max(1, ...dados.flatMap((d) => [d.entrada, d.saida]));
  const largura = 1000;
  const margemBaixo = 22;
  const util = altura - margemBaixo;
  const passo = largura / dados.length;
  const larguraBarra = Math.max(2, Math.min(14, passo / 2.6));
  const rotulosVisiveis = Math.ceil(dados.length / 12);

  return (
    <figure className="w-full">
      <div className="mb-3 flex items-center gap-4 text-xs text-[var(--texto-2)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--positivo)]" /> Entradas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--acento)]" /> Saídas
        </span>
      </div>
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="h-48 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico de entradas e saídas por período"
      >
        {[0.25, 0.5, 0.75, 1].map((fracao) => (
          <line
            key={fracao}
            x1={0}
            x2={largura}
            y1={util - util * fracao}
            y2={util - util * fracao}
            stroke="var(--borda)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}

        {dados.map((ponto, i) => {
          const centro = i * passo + passo / 2;
          const alturaEntrada = (ponto.entrada / maximo) * util;
          const alturaSaida = (ponto.saida / maximo) * util;
          return (
            <g key={`${ponto.rotulo}-${i}`}>
              <title>{`${ponto.rotulo} — entradas ${numero(ponto.entrada)} · saídas ${numero(ponto.saida)}`}</title>
              <rect
                x={centro - larguraBarra - 1}
                y={util - alturaEntrada}
                width={larguraBarra}
                height={Math.max(alturaEntrada, ponto.entrada > 0 ? 2 : 0)}
                fill="var(--positivo)"
                rx={1.5}
              />
              <rect
                x={centro + 1}
                y={util - alturaSaida}
                width={larguraBarra}
                height={Math.max(alturaSaida, ponto.saida > 0 ? 2 : 0)}
                fill="var(--acento)"
                rx={1.5}
              />
              {i % rotulosVisiveis === 0 && (
                <text
                  x={centro}
                  y={altura - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--texto-3)"
                >
                  {ponto.rotulo}
                </text>
              )}
            </g>
          );
        })}

        <line
          x1={0}
          x2={largura}
          y1={util}
          y2={util}
          stroke="var(--borda-forte)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </figure>
  );
}

/** 1.20 / 1.21 / 1.22 — rankings horizontais */
export function Ranking({
  itens,
  sufixo,
}: {
  itens: { rotulo: string; valor: number; detalhe?: string; cor?: string }[];
  sufixo?: (valor: number) => string;
}) {
  const maximo = Math.max(1, ...itens.map((i) => i.valor));

  return (
    <ol className="space-y-2.5">
      {itens.map((item, i) => (
        <li key={item.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm">
              <span className="mr-1.5 text-[var(--texto-3)] tabular">{i + 1}.</span>
              {item.rotulo}
            </span>
            <span className="tabular shrink-0 text-sm font-medium">
              {sufixo ? sufixo(item.valor) : numero(item.valor)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--superficie-3)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (item.valor / maximo) * 100)}%`,
                background: item.cor ?? "var(--acento)",
              }}
            />
          </div>
          {item.detalhe && (
            <p className="mt-0.5 text-xs text-[var(--texto-3)]">{item.detalhe}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** distribuição em uma barra única — usado no perfil de cada material */
export function BarraDistribuicao({
  partes,
}: {
  partes: { rotulo: string; valor: number; cor: string }[];
}) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return null;

  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--superficie-3)]">
        {partes.map((parte) =>
          parte.valor > 0 ? (
            <div
              key={parte.rotulo}
              style={{ width: `${(parte.valor / total) * 100}%`, background: parte.cor }}
              title={`${parte.rotulo}: ${numero(parte.valor)}`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--texto-2)]">
        {partes
          .filter((p) => p.valor > 0)
          .map((parte) => (
            <span key={parte.rotulo} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ background: parte.cor }}
              />
              {parte.rotulo}
              <span className="tabular font-medium text-[var(--texto)]">
                {numero(parte.valor)}
              </span>
            </span>
          ))}
      </div>
    </div>
  );
}
