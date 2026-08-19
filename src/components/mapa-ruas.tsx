"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Crosshair } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MAPA COM RUAS.
 *
 * Renderiza tiles do OpenStreetMap direto, sem biblioteca de mapa. A conta é
 * simples e conhecida — projeção de Mercator esférica, a mesma que todo mapa
 * de rua usa —, e implementá-la evita arrastar uma dependência grande para
 * fazer o que cabe em duzentas linhas.
 *
 * O mapa anterior projetava as coordenadas num plano proporcional. Respondia
 * "quem está perto de quê", mas não respondia "onde é isso" — e sem rua o
 * supervisor não reconhece o lugar que ele conhece de cor.
 *
 * Requer que o navegador alcance a internet. Numa rede isolada os tiles não
 * carregam e sobra o fundo com os marcadores, que continua utilizável.
 */

const TAMANHO_TILE = 256;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18;

export type PontoMapaRua = {
  id: string;
  rotulo: string;
  detalhe?: string;
  latitude: number;
  longitude: number;
  /** cor do marcador */
  cor: string;
  /** desenha um halo, para destacar urgência */
  destaque?: boolean;
  href?: string;
};

// --- projeção -------------------------------------------------------------

function paraPixel(lat: number, lng: number, zoom: number) {
  const escala = TAMANHO_TILE * 2 ** zoom;
  const senoLat = Math.sin((lat * Math.PI) / 180);
  return {
    x: ((lng + 180) / 360) * escala,
    y:
      (0.5 - Math.log((1 + senoLat) / (1 - senoLat)) / (4 * Math.PI)) * escala,
  };
}

/** o caminho de volta: pixel do mundo → latitude e longitude */
function paraCoordenada(x: number, y: number, zoom: number) {
  const escala = TAMANHO_TILE * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / escala;
  return {
    longitude: (x / escala) * 360 - 180,
    latitude: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
  };
}

/** o zoom que faz todos os pontos caberem na área disponível */
function zoomQueEnquadra(
  pontos: { latitude: number; longitude: number }[],
  largura: number,
  altura: number,
) {
  if (pontos.length < 2) return 14;

  for (let zoom = ZOOM_MAX; zoom >= ZOOM_MIN; zoom--) {
    const posicoes = pontos.map((p) => paraPixel(p.latitude, p.longitude, zoom));
    const larguraUsada =
      Math.max(...posicoes.map((p) => p.x)) - Math.min(...posicoes.map((p) => p.x));
    const alturaUsada =
      Math.max(...posicoes.map((p) => p.y)) - Math.min(...posicoes.map((p) => p.y));

    // margem de 15% para os marcadores não colarem na borda
    if (larguraUsada < largura * 0.85 && alturaUsada < altura * 0.85) return zoom;
  }
  return ZOOM_MIN;
}

/** 3.17 — contorno desenhado sobre o mapa, em `[latitude, longitude]` */
export type PoligonoMapa = {
  id: string;
  rotulo?: string;
  vertices: [number, number][];
  cor: string;
  /** desenha os vértices como alças, para quem está editando */
  editando?: boolean;
};

/** Fortaleza — só serve de enquadramento quando não há nada a mostrar ainda */
const CENTRO_PADRAO = { lat: -3.7319, lng: -38.5267 };

export function MapaRuas({
  pontos,
  poligonos = [],
  aoClicarNoMapa,
  altura = 460,
  className,
}: {
  pontos: PontoMapaRua[];
  poligonos?: PoligonoMapa[];
  /** recebe a coordenada do clique; com ele o mapa vira prancheta (3.17) */
  aoClicarNoMapa?: (latitude: number, longitude: number) => void;
  altura?: number;
  className?: string;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  const inicioDoArrasto = useRef<{ x: number; y: number } | null>(null);
  const [tamanho, setTamanho] = useState({ largura: 800, altura });
  const [zoom, setZoom] = useState<number | null>(null);
  const [centro, setCentro] = useState<{ lat: number; lng: number } | null>(null);
  const [arrasto, setArrasto] = useState<{ x: number; y: number } | null>(null);
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const validos = useMemo(
    () =>
      pontos.filter(
        (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
      ),
    [pontos],
  );

  // acompanha o tamanho real do contêiner: o enquadramento depende dele
  useEffect(() => {
    const elemento = caixa.current;
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      setTamanho({
        largura: entrada.contentRect.width,
        altura: entrada.contentRect.height,
      });
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  /**
   * O enquadramento considera também os vértices do contorno: quem está
   * desenhando um bairro pode não ter nenhum marcador na tela, e o mapa
   * precisa abrir onde o desenho está.
   */
  const referencias = useMemo(
    () => [
      ...validos.map((p) => ({ latitude: p.latitude, longitude: p.longitude })),
      ...poligonos.flatMap((poligono) =>
        poligono.vertices.map(([latitude, longitude]) => ({
          latitude,
          longitude,
        })),
      ),
    ],
    [validos, poligonos],
  );

  // enquadra na primeira renderização e sempre que os pontos mudarem de conjunto
  const chaveDosPontos = validos.map((p) => p.id).join(",");
  useEffect(() => {
    if (!validos.length) return;
    setCentro({
      lat:
        (Math.max(...validos.map((p) => p.latitude)) +
          Math.min(...validos.map((p) => p.latitude))) /
        2,
      lng:
        (Math.max(...validos.map((p) => p.longitude)) +
          Math.min(...validos.map((p) => p.longitude))) /
        2,
    });
    setZoom(zoomQueEnquadra(validos, tamanho.largura, tamanho.altura));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDosPontos, tamanho.largura, tamanho.altura]);

  // mapa sem marcador ainda é útil para desenhar; sem nada e sem lápis, não
  if (!validos.length && !poligonos.length && !aoClicarNoMapa) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-dashed border-[var(--borda-forte)] text-sm text-[var(--texto-3)]"
        style={{ height: altura }}
      >
        Nenhuma posição conhecida para exibir.
      </div>
    );
  }

  const z = zoom ?? 14;
  const meio =
    centro ??
    (referencias.length
      ? { lat: referencias[0].latitude, lng: referencias[0].longitude }
      : CENTRO_PADRAO);
  const pixelCentro = paraPixel(meio.lat, meio.lng, z);

  // canto superior esquerdo da área visível, em pixels do mundo
  const origem = {
    x: pixelCentro.x - tamanho.largura / 2,
    y: pixelCentro.y - tamanho.altura / 2,
  };

  const primeiroTile = {
    x: Math.floor(origem.x / TAMANHO_TILE),
    y: Math.floor(origem.y / TAMANHO_TILE),
  };
  const colunas = Math.ceil(tamanho.largura / TAMANHO_TILE) + 1;
  const linhas = Math.ceil(tamanho.altura / TAMANHO_TILE) + 1;
  const limite = 2 ** z;

  const tiles: { chave: string; url: string; esquerda: number; topo: number }[] = [];
  for (let dx = 0; dx < colunas; dx++) {
    for (let dy = 0; dy < linhas; dy++) {
      const tx = primeiroTile.x + dx;
      const ty = primeiroTile.y + dy;
      if (ty < 0 || ty >= limite) continue;
      // o mundo dá a volta na horizontal, mas não na vertical
      const txCiclico = ((tx % limite) + limite) % limite;
      tiles.push({
        chave: `${z}/${tx}/${ty}`,
        url: `https://tile.openstreetmap.org/${z}/${txCiclico}/${ty}.png`,
        esquerda: tx * TAMANHO_TILE - origem.x,
        topo: ty * TAMANHO_TILE - origem.y,
      });
    }
  }

  function moverZoom(delta: number) {
    setZoom((atual) => {
      const proximo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, (atual ?? 14) + delta));
      return proximo;
    });
  }

  function reenquadrar() {
    if (!referencias.length) return;
    setCentro({
      lat:
        (Math.max(...referencias.map((p) => p.latitude)) +
          Math.min(...referencias.map((p) => p.latitude))) /
        2,
      lng:
        (Math.max(...referencias.map((p) => p.longitude)) +
          Math.min(...referencias.map((p) => p.longitude))) /
        2,
    });
    setZoom(zoomQueEnquadra(referencias, tamanho.largura, tamanho.altura));
  }

  /** desloca o centro em pixels, convertendo de volta para coordenada */
  function arrastarPara(dx: number, dy: number) {
    const destino = paraCoordenada(pixelCentro.x - dx, pixelCentro.y - dy, z);
    setCentro({ lat: destino.latitude, lng: destino.longitude });
  }

  /** posição do clique dentro da área visível → coordenada no mundo */
  function coordenadaDoEvento(evento: { clientX: number; clientY: number }) {
    const area = caixa.current?.getBoundingClientRect();
    if (!area) return null;
    return paraCoordenada(
      origem.x + (evento.clientX - area.left),
      origem.y + (evento.clientY - area.top),
      z,
    );
  }

  const detalhe = validos.find((p) => p.id === selecionado);

  return (
    <div className={cn("space-y-2", className)}>
      <div
        ref={caixa}
        className="relative overflow-hidden rounded-lg border border-[var(--borda)] bg-[var(--superficie-3)]"
        style={{ height: altura, cursor: arrasto ? "grabbing" : "grab" }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setArrasto({ x: e.clientX, y: e.clientY });
          inicioDoArrasto.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!arrasto) return;
          arrastarPara(e.clientX - arrasto.x, e.clientY - arrasto.y);
          setArrasto({ x: e.clientX, y: e.clientY });
        }}
        onPointerUp={(e) => {
          setArrasto(null);
          if (!aoClicarNoMapa) return;

          // arrastar o mapa não pode virar ponto novo no contorno
          const inicio = inicioDoArrasto.current;
          inicioDoArrasto.current = null;
          if (
            !inicio ||
            Math.abs(e.clientX - inicio.x) > 4 ||
            Math.abs(e.clientY - inicio.y) > 4
          ) {
            return;
          }

          const destino = coordenadaDoEvento(e);
          if (destino) aoClicarNoMapa(destino.latitude, destino.longitude);
        }}
        onPointerLeave={() => setArrasto(null)}
        onWheel={(e) => moverZoom(e.deltaY < 0 ? 1 : -1)}
      >
        {tiles.map((tile) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={tile.chave}
            src={tile.url}
            alt=""
            width={TAMANHO_TILE}
            height={TAMANHO_TILE}
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={{ left: tile.esquerda, top: tile.topo }}
            loading="lazy"
          />
        ))}

        {/* 3.17 — o contorno vai abaixo dos marcadores e não intercepta clique */}
        {poligonos.length > 0 && (
          <svg
            className="pointer-events-none absolute inset-0"
            width={tamanho.largura}
            height={tamanho.altura}
            aria-hidden
          >
            {poligonos.map((poligono) => {
              const pixels = poligono.vertices.map(([lat, lng]) => {
                const p = paraPixel(lat, lng, z);
                return { x: p.x - origem.x, y: p.y - origem.y };
              });
              if (!pixels.length) return null;

              return (
                <g key={poligono.id}>
                  {pixels.length >= 3 && (
                    <polygon
                      points={pixels.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={poligono.cor}
                      fillOpacity={0.15}
                      stroke={poligono.cor}
                      strokeWidth={2}
                    />
                  )}
                  {pixels.length === 2 && (
                    <line
                      x1={pixels[0].x}
                      y1={pixels[0].y}
                      x2={pixels[1].x}
                      y2={pixels[1].y}
                      stroke={poligono.cor}
                      strokeWidth={2}
                    />
                  )}
                  {poligono.editando &&
                    pixels.map((p, indice) => (
                      <circle
                        key={indice}
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill="#fff"
                        stroke={poligono.cor}
                        strokeWidth={2}
                      />
                    ))}
                </g>
              );
            })}
          </svg>
        )}

        {validos.map((ponto) => {
          const p = paraPixel(ponto.latitude, ponto.longitude, z);
          const x = p.x - origem.x;
          const y = p.y - origem.y;
          if (x < -40 || y < -40 || x > tamanho.largura + 40 || y > tamanho.altura + 40) {
            return null;
          }
          const ativo = selecionado === ponto.id;

          return (
            <button
              key={ponto.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelecionado(ativo ? null : ponto.id);
              }}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: x, top: y, zIndex: ativo ? 20 : 10 }}
              aria-label={ponto.rotulo}
            >
              {ponto.destaque && (
                <span
                  className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ background: ponto.cor, opacity: 0.25 }}
                />
              )}
              <span
                className="relative block rounded-full border-2 border-white shadow-md"
                style={{
                  background: ponto.cor,
                  width: ativo ? 18 : 13,
                  height: ativo ? 18 : 13,
                }}
              />
            </button>
          );
        })}

        <div className="absolute top-2 right-2 z-30 flex flex-col gap-1">
          {[
            { rotulo: "Aproximar", icone: Plus, acao: () => moverZoom(1) },
            { rotulo: "Afastar", icone: Minus, acao: () => moverZoom(-1) },
            { rotulo: "Enquadrar tudo", icone: Crosshair, acao: reenquadrar },
          ].map((botao) => (
            <button
              key={botao.rotulo}
              type="button"
              onClick={botao.acao}
              title={botao.rotulo}
              aria-label={botao.rotulo}
              className="grid size-8 place-items-center rounded-md border border-[var(--borda-forte)] bg-[var(--superficie)] text-[var(--texto-2)] shadow-sm hover:text-[var(--texto)]"
            >
              <botao.icone className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        <span className="absolute right-1 bottom-0.5 z-30 rounded bg-[var(--superficie)]/85 px-1 text-[10px] text-[var(--texto-3)]">
          © OpenStreetMap
        </span>
      </div>

      {detalhe ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-sm">
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ background: detalhe.cor }}
            aria-hidden
          />
          {detalhe.href ? (
            <a href={detalhe.href} className="font-medium hover:text-[var(--acento)]">
              {detalhe.rotulo}
            </a>
          ) : (
            <span className="font-medium">{detalhe.rotulo}</span>
          )}
          {detalhe.detalhe && (
            <span className="text-xs text-[var(--texto-3)]">{detalhe.detalhe}</span>
          )}
          <span className="ml-auto font-mono text-[11px] text-[var(--texto-3)]">
            {detalhe.latitude.toFixed(5)}, {detalhe.longitude.toFixed(5)}
          </span>
        </div>
      ) : (
        <p className="text-xs text-[var(--texto-3)]">
          Arraste para mover, role para aproximar. Clique num marcador para ver de
          quem é — os nomes ficam escondidos de propósito, senão se sobrepõem
          quando os pontos estão próximos.
        </p>
      )}
    </div>
  );
}
