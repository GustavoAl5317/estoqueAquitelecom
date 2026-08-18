"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Flame, LayoutGrid, MapPin } from "lucide-react";
import { PRIORIDADE_OS, SEVERIDADE_OS, TIPO_OS } from "@/lib/dominio";
import { numero } from "@/lib/utils";
import { Botao, Etiqueta } from "./ui";

export type OrdemNoMapa = {
  id: string;
  numero: string;
  cliente: string | null;
  endereco: string | null;
  bairro: string | null;
  tipo: string;
  severidade: string;
  prioridade: string;
  latitude: number;
  longitude: number;
  emRisco: boolean;
};

const COR_SEVERIDADE: Record<string, string> = {
  CRITICA: "var(--critico)",
  ALTA: "var(--atencao)",
  MEDIA: "var(--informativo)",
  BAIXA: "var(--acento)",
};

/**
 * 2.30 a 2.32 / 3.41 — MAPA DAS ORDENS.
 *
 * Três leituras do mesmo dado, porque respondem perguntas diferentes:
 *
 * - **pontos**: onde está cada OS, para clicar e abrir;
 * - **agrupado**: quantas há em cada vizinhança, quando a tela tem mais
 *   marcadores do que olho humano consegue separar;
 * - **calor**: onde a densidade se concentra, sem precisar contar.
 *
 * O mapa não baixa tiles de rua. A pergunta aqui é proximidade relativa — quem
 * está perto de quê — e ela se responde com uma projeção proporcional. Trocar
 * por um mapa com ruas é substituir só este componente.
 */
export function MapaOrdens({
  ordens,
  altura = 460,
}: {
  ordens: OrdemNoMapa[];
  altura?: number;
}) {
  const [modo, setModo] = useState<"pontos" | "agrupado" | "calor">("pontos");
  const [selecionada, setSelecionada] = useState<OrdemNoMapa | null>(null);

  const projecao = useMemo(() => {
    if (!ordens.length) return null;

    const lats = ordens.map((o) => o.latitude);
    const lngs = ordens.map((o) => o.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const spanLat = Math.max(maxLat - minLat, 0.01);
    const spanLng = Math.max(maxLng - minLng, 0.01);
    const folga = 0.1;
    const largura = 1000;
    const alturaViewbox = 640;

    return {
      largura,
      alturaViewbox,
      ponto: (o: { latitude: number; longitude: number }) => ({
        x: largura * (folga + ((o.longitude - minLng) / spanLng) * (1 - folga * 2)),
        y:
          alturaViewbox *
          (folga + ((maxLat - o.latitude) / spanLat) * (1 - folga * 2)),
      }),
    };
  }, [ordens]);

  /**
   * 2.31 — agrupamento por célula da grade.
   *
   * Não é k-means: é uma grade fixa sobre a projeção. A diferença é que a
   * grade é estável — o mesmo ponto cai sempre na mesma célula, e o mapa não
   * "pula" quando uma OS nova entra. Para contar concentração, estabilidade
   * vale mais que precisão de fronteira.
   */
  const grupos = useMemo(() => {
    if (!projecao) return [];
    const CELULA = 70;
    const mapa = new Map<string, { x: number; y: number; itens: OrdemNoMapa[] }>();

    for (const ordem of ordens) {
      const { x, y } = projecao.ponto(ordem);
      const chave = `${Math.floor(x / CELULA)}:${Math.floor(y / CELULA)}`;
      const atual = mapa.get(chave) ?? { x: 0, y: 0, itens: [] };
      atual.itens.push(ordem);
      // o centro do grupo é a média dos pontos, não o centro da célula
      atual.x =
        atual.itens.reduce((s, o) => s + projecao.ponto(o).x, 0) / atual.itens.length;
      atual.y =
        atual.itens.reduce((s, o) => s + projecao.ponto(o).y, 0) / atual.itens.length;
      mapa.set(chave, atual);
    }

    return [...mapa.values()];
  }, [ordens, projecao]);

  if (!ordens.length || !projecao) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-[var(--borda-forte)] text-sm text-[var(--texto-3)]">
        Nenhuma OS com coordenada para exibir.
      </div>
    );
  }

  const maiorGrupo = Math.max(...grupos.map((g) => g.itens.length), 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            { valor: "pontos", rotulo: "Pontos", icone: MapPin },
            { valor: "agrupado", rotulo: "Agrupado", icone: LayoutGrid },
            { valor: "calor", rotulo: "Calor", icone: Flame },
          ] as const
        ).map((opcao) => (
          <Botao
            key={opcao.valor}
            variante={modo === opcao.valor ? "primario" : "secundario"}
            onClick={() => {
              setModo(opcao.valor);
              setSelecionada(null);
            }}
          >
            <opcao.icone className="size-4" aria-hidden /> {opcao.rotulo}
          </Botao>
        ))}

        <span className="ml-auto text-xs text-[var(--texto-3)]">
          {ordens.length} OS · {grupos.length} agrupamento(s)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${projecao.largura} ${projecao.alturaViewbox}`}
        style={{ height: altura }}
        className="w-full rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)]"
        role="img"
        aria-label={`Mapa com ${ordens.length} ordens de serviço`}
      >
        {modo === "calor" && (
          <>
            <defs>
              <radialGradient id="calor">
                <stop offset="0%" stopColor="var(--critico)" stopOpacity="0.55" />
                <stop offset="60%" stopColor="var(--atencao)" stopOpacity="0.22" />
                <stop offset="100%" stopColor="var(--atencao)" stopOpacity="0" />
              </radialGradient>
            </defs>
            {grupos.map((grupo, i) => (
              <circle
                key={`calor-${i}`}
                cx={grupo.x}
                cy={grupo.y}
                // o raio cresce com a raiz da contagem: área proporcional ao
                // volume, que é como o olho compara manchas
                r={40 + Math.sqrt(grupo.itens.length / maiorGrupo) * 90}
                fill="url(#calor)"
              />
            ))}
          </>
        )}

        {modo === "agrupado" &&
          grupos.map((grupo, i) => {
            const raio = 14 + Math.sqrt(grupo.itens.length) * 6;
            const criticas = grupo.itens.filter(
              (o) => o.severidade === "CRITICA" || o.emRisco,
            ).length;
            return (
              <g key={`grupo-${i}`}>
                <circle
                  cx={grupo.x}
                  cy={grupo.y}
                  r={raio}
                  fill={criticas ? "var(--critico)" : "var(--acento)"}
                  opacity={0.85}
                />
                <text
                  x={grupo.x}
                  y={grupo.y + 5}
                  textAnchor="middle"
                  fontSize={15}
                  fontWeight={600}
                  fill="#fff"
                >
                  {grupo.itens.length}
                </text>
              </g>
            );
          })}

        {modo === "pontos" &&
          ordens.map((ordem) => {
            const { x, y } = projecao.ponto(ordem);
            return (
              <g
                key={ordem.id}
                onClick={() => setSelecionada(ordem)}
                style={{ cursor: "pointer" }}
              >
                {ordem.emRisco && (
                  <circle cx={x} cy={y} r={13} fill="var(--critico)" opacity={0.2} />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={selecionada?.id === ordem.id ? 11 : 7}
                  fill={COR_SEVERIDADE[ordem.severidade] ?? "var(--acento)"}
                  stroke="var(--superficie)"
                  strokeWidth={2}
                />
              </g>
            );
          })}
      </svg>

      {selecionada ? (
        <div className="rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/os/${selecionada.id}`}
              className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
            >
              {selecionada.numero}
            </Link>
            <Etiqueta tom={SEVERIDADE_OS.tom(selecionada.severidade)}>
              {SEVERIDADE_OS.rotulo(selecionada.severidade)}
            </Etiqueta>
            <Etiqueta tom={PRIORIDADE_OS.tom(selecionada.prioridade)}>
              {selecionada.prioridade}
            </Etiqueta>
            <button
              type="button"
              onClick={() => setSelecionada(null)}
              className="ml-auto text-xs text-[var(--texto-3)]"
            >
              fechar
            </button>
          </div>
          <p className="mt-1 text-sm font-medium">
            {selecionada.cliente ?? "Cliente não informado"}
          </p>
          <p className="text-xs text-[var(--texto-3)]">
            {TIPO_OS.rotulo(selecionada.tipo)} ·{" "}
            {selecionada.bairro ?? selecionada.endereco ?? "sem endereço"} ·{" "}
            {numero(selecionada.latitude, 5)}, {numero(selecionada.longitude, 5)}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--texto-3)]">
          {modo === "pontos" ? (
            <>
              <span>Cor pela severidade:</span>
              {SEVERIDADE_OS.opcoes.map((opcao) => (
                <span key={opcao.valor} className="flex items-center gap-1">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: COR_SEVERIDADE[opcao.valor] }}
                  />
                  {opcao.rotulo}
                </span>
              ))}
              <span className="ml-auto">Clique num ponto para ver a OS.</span>
            </>
          ) : modo === "agrupado" ? (
            <span>
              O número é a quantidade de OS na vizinhança. Vermelho indica que há
              severidade crítica ou prazo em risco no grupo.
            </span>
          ) : (
            <span>
              A mancha mostra concentração, não gravidade. Serve para achar a
              região que está puxando o dia — o detalhe fica no modo Pontos.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
