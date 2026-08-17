import { numero } from "@/lib/utils";

export type PontoMapa = {
  id: string;
  rotulo: string;
  detalhe?: string;
  latitude: number;
  longitude: number;
  tipo: "VEICULO" | "ESTOQUE" | "OS";
  tom?: "ok" | "atencao" | "critico";
};

const CORES = {
  VEICULO: { ok: "var(--acento)", atencao: "var(--atencao)", critico: "var(--critico)" },
  ESTOQUE: { ok: "var(--positivo)", atencao: "var(--positivo)", critico: "var(--positivo)" },
  OS: { ok: "var(--roxo)", atencao: "var(--atencao)", critico: "var(--critico)" },
} as const;

/**
 * 3.2 — mapa operacional sem dependência externa.
 *
 * Projeta as coordenadas num plano proporcional, sem baixar tiles de rua: o
 * que a operação precisa responder aqui é proximidade relativa — quem está
 * perto de quê. Trocar por um mapa com ruas é substituir só este componente.
 */
export function MapaOperacional({
  pontos,
  altura = 380,
}: {
  pontos: PontoMapa[];
  altura?: number;
}) {
  const validos = pontos.filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  );

  if (validos.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[var(--borda-forte)] text-sm text-[var(--texto-3)]">
        Nenhuma posição conhecida para exibir.
      </div>
    );
  }

  const lats = validos.map((p) => p.latitude);
  const lngs = validos.map((p) => p.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // margem mínima para que um ponto único não fique degenerado
  const spanLat = Math.max(maxLat - minLat, 0.01);
  const spanLng = Math.max(maxLng - minLng, 0.01);
  const folga = 0.12;

  const largura = 1000;
  const alturaViewbox = 620;

  const projetar = (ponto: PontoMapa) => {
    const x =
      ((ponto.longitude - minLng + spanLng * folga) / (spanLng * (1 + folga * 2))) *
      largura;
    // latitude cresce para o norte, y cresce para baixo
    const y =
      alturaViewbox -
      ((ponto.latitude - minLat + spanLat * folga) / (spanLat * (1 + folga * 2))) *
        alturaViewbox;
    return { x, y };
  };

  // escala aproximada: 1 grau de latitude ≈ 111 km
  const kmVerticais = spanLat * 111;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${largura} ${alturaViewbox}`}
        style={{ height: altura }}
        className="w-full rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)]"
        role="img"
        aria-label="Mapa operacional com posição de veículos e estoques"
      >
        <defs>
          <pattern id="grade" width="50" height="50" patternUnits="userSpaceOnUse">
            <path
              d="M 50 0 L 0 0 0 50"
              fill="none"
              stroke="var(--borda)"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width={largura} height={alturaViewbox} fill="url(#grade)" />

        {validos.map((ponto) => {
          const { x, y } = projetar(ponto);
          const cor = CORES[ponto.tipo][ponto.tom ?? "ok"];

          return (
            <g key={`${ponto.tipo}-${ponto.id}`}>
              <title>
                {`${ponto.rotulo}${ponto.detalhe ? ` — ${ponto.detalhe}` : ""}`}
              </title>

              {ponto.tipo === "ESTOQUE" ? (
                <rect
                  x={x - 7}
                  y={y - 7}
                  width={14}
                  height={14}
                  rx={3}
                  fill={cor}
                  stroke="var(--superficie)"
                  strokeWidth={2}
                />
              ) : (
                <>
                  <circle cx={x} cy={y} r={13} fill={cor} opacity={0.16} />
                  <circle
                    cx={x}
                    cy={y}
                    r={7}
                    fill={cor}
                    stroke="var(--superficie)"
                    strokeWidth={2}
                  />
                </>
              )}

              <text
                x={x}
                y={y - 14}
                textAnchor="middle"
                fontSize={13}
                fontWeight={600}
                fill="var(--texto)"
              >
                {ponto.rotulo}
              </text>
              {ponto.detalhe && (
                <text
                  x={x}
                  y={y + 24}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--texto-3)"
                >
                  {ponto.detalhe}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--texto-3)]">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--acento)]" /> Veículo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-[var(--positivo)]" /> Estoque
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-[var(--atencao)]" /> Posição
          desatualizada
        </span>
        <span className="ml-auto">
          Área exibida: aprox. {numero(kmVerticais, 1)} km na vertical
        </span>
      </figcaption>
    </figure>
  );
}
