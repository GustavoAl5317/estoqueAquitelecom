"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, MapPin, Pause, Play } from "lucide-react";
import { dataHora, numero } from "@/lib/utils";
import { Botao, Etiqueta } from "./ui";

export type PontoTrajeto = {
  id: string;
  latitude: number;
  longitude: number;
  velocidade: number | null;
  ignicao: boolean | null;
  endereco: string | null;
  capturadoEm: string;
};

/**
 * 3.17 — REPLAY DO TRAJETO.
 *
 * Reconstrói o dia do veículo a partir das posições gravadas. Serve para a
 * pergunta que sempre aparece depois: "onde ele esteve entre 10h e 12h?".
 *
 * As paradas ganham marcação própria — velocidade zero é onde a operação
 * realmente acontece, e é o que o supervisor procura quando abre esta tela.
 */
export function Trajeto({
  pontos,
  altura = 420,
}: {
  pontos: PontoTrajeto[];
  altura?: number;
}) {
  const [indice, setIndice] = useState(pontos.length - 1);
  const [tocando, setTocando] = useState(false);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tocando) return;
    temporizador.current = setInterval(() => {
      setIndice((atual) => {
        if (atual >= pontos.length - 1) {
          setTocando(false);
          return atual;
        }
        return atual + 1;
      });
    }, 350);
    return () => {
      if (temporizador.current) clearInterval(temporizador.current);
    };
  }, [tocando, pontos.length]);

  const projecao = useMemo(() => {
    if (!pontos.length) return null;

    const lats = pontos.map((p) => p.latitude);
    const lngs = pontos.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const spanLat = Math.max(maxLat - minLat, 0.004);
    const spanLng = Math.max(maxLng - minLng, 0.004);
    const folga = 0.12;
    const largura = 1000;
    const alturaViewbox = 620;

    return {
      largura,
      alturaViewbox,
      ponto: (p: { latitude: number; longitude: number }) => ({
        x:
          largura *
          (folga + ((p.longitude - minLng) / spanLng) * (1 - folga * 2)),
        // latitude cresce para o norte; y cresce para baixo
        y:
          alturaViewbox *
          (folga + ((maxLat - p.latitude) / spanLat) * (1 - folga * 2)),
      }),
    };
  }, [pontos]);

  if (!pontos.length || !projecao) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-[var(--borda-forte)] text-sm text-[var(--texto-3)]">
        Nenhuma posição registrada neste período.
      </div>
    );
  }

  const visiveis = pontos.slice(0, indice + 1);
  const atual = pontos[indice];
  const caminho = visiveis
    .map((p, i) => {
      const { x, y } = projecao.ponto(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const paradas = pontos.filter((p) => (p.velocidade ?? 0) === 0);
  const posicaoAtual = projecao.ponto(atual);

  return (
    <div className="space-y-3">
      <svg
        viewBox={`0 0 ${projecao.largura} ${projecao.alturaViewbox}`}
        style={{ height: altura }}
        className="w-full rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)]"
        role="img"
        aria-label={`Trajeto com ${pontos.length} posições`}
      >
        <path
          d={caminho}
          fill="none"
          stroke="var(--acento)"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />

        {paradas.map((parada) => {
          const { x, y } = projecao.ponto(parada);
          return (
            <circle
              key={`parada-${parada.id}`}
              cx={x}
              cy={y}
              r={7}
              fill="var(--atencao-suave)"
              stroke="var(--atencao)"
              strokeWidth={2}
            />
          );
        })}

        {/* partida */}
        <circle
          cx={projecao.ponto(pontos[0]).x}
          cy={projecao.ponto(pontos[0]).y}
          r={6}
          fill="var(--positivo)"
        />

        {/* posição no instante selecionado */}
        <circle
          cx={posicaoAtual.x}
          cy={posicaoAtual.y}
          r={12}
          fill="var(--acento)"
          opacity={0.25}
        />
        <circle cx={posicaoAtual.x} cy={posicaoAtual.y} r={6} fill="var(--acento)" />
      </svg>

      <div className="flex flex-wrap items-center gap-3">
        <Botao
          variante="secundario"
          onClick={() => {
            if (indice >= pontos.length - 1) setIndice(0);
            setTocando((t) => !t);
          }}
        >
          {tocando ? (
            <>
              <Pause className="size-4" aria-hidden /> Pausar
            </>
          ) : (
            <>
              <Play className="size-4" aria-hidden /> Reproduzir
            </>
          )}
        </Botao>

        <input
          type="range"
          min={0}
          max={pontos.length - 1}
          value={indice}
          onChange={(evento) => {
            setTocando(false);
            setIndice(Number(evento.target.value));
          }}
          className="min-w-48 flex-1"
          aria-label="Instante do trajeto"
        />

        <span className="tabular text-xs text-[var(--texto-3)]">
          {indice + 1}/{pontos.length}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--superficie-2)] px-3 py-2 text-sm">
        <span className="font-medium">{dataHora(atual.capturadoEm)}</span>
        <Etiqueta tom={(atual.velocidade ?? 0) > 0 ? "informativo" : "atencao"}>
          <Gauge className="size-3" aria-hidden />
          {numero(atual.velocidade ?? 0)} km/h
        </Etiqueta>
        {atual.ignicao !== null && (
          <Etiqueta tom={atual.ignicao ? "positivo" : "neutro"}>
            ignição {atual.ignicao ? "ligada" : "desligada"}
          </Etiqueta>
        )}
        {atual.endereco && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-[var(--texto-3)]">
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{atual.endereco}</span>
          </span>
        )}
        <span className="ml-auto text-xs text-[var(--texto-3)]">
          {paradas.length} parada(s) no período
        </span>
      </div>
    </div>
  );
}
