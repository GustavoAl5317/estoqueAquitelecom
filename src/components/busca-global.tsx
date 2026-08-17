"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import type { ResultadoBusca } from "@/lib/servicos/consultas";

const ROTULO_TIPO: Record<ResultadoBusca["tipo"], string> = {
  MATERIAL: "Material",
  SERIAL: "Equipamento",
  DETENTOR: "Local",
  ENTRADA: "Entrada",
  MOVIMENTACAO: "Movimentação",
};

/**
 * 1.28 — BUSCA GLOBAL.
 * Pesquisa por nome, código, serial, MAC, patrimônio, técnico, equipe e
 * número de documento a partir de um único campo.
 */
export function BuscaGlobal() {
  const router = useRouter();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }
    const controlador = new AbortController();
    const timer = setTimeout(async () => {
      setCarregando(true);
      try {
        const resposta = await fetch(`/api/busca?q=${encodeURIComponent(termo)}`, {
          signal: controlador.signal,
        });
        const dados = (await resposta.json()) as ResultadoBusca[];
        setResultados(dados);
        setIndice(0);
        setAberto(true);
      } catch {
        // busca cancelada por nova digitação
      } finally {
        setCarregando(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controlador.abort();
    };
  }, [termo]);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (!container.current?.contains(evento.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  useEffect(() => {
    function atalho(evento: KeyboardEvent) {
      if ((evento.ctrlKey || evento.metaKey) && evento.key === "k") {
        evento.preventDefault();
        container.current?.querySelector("input")?.focus();
      }
    }
    document.addEventListener("keydown", atalho);
    return () => document.removeEventListener("keydown", atalho);
  }, []);

  function navegar(destino: string) {
    setAberto(false);
    setTermo("");
    router.push(destino);
  }

  return (
    <div ref={container} className="relative w-full max-w-md">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--texto-3)]"
          aria-hidden
        />
        <input
          type="search"
          value={termo}
          placeholder="Pesquisar estoque…  (nome, código, serial, MAC, técnico)"
          className="!pl-8.5"
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length && setAberto(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setIndice((i) => Math.min(i + 1, resultados.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndice((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && resultados[indice]) {
              e.preventDefault();
              navegar(resultados[indice].href);
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
        />
        {carregando && (
          <Loader2 className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-[var(--texto-3)]" />
        )}
      </div>

      {aberto && termo.trim().length >= 2 && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1.5 max-h-96 overflow-y-auto rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] shadow-[var(--sombra-alta)]">
          {resultados.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--texto-3)]">
              {carregando ? "Buscando…" : "Nenhum resultado encontrado."}
            </p>
          ) : (
            <ul className="py-1">
              {resultados.map((resultado, i) => (
                <li key={`${resultado.tipo}-${resultado.href}`}>
                  <button
                    type="button"
                    onMouseEnter={() => setIndice(i)}
                    onClick={() => navegar(resultado.href)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      i === indice ? "bg-[var(--superficie-3)]" : ""
                    }`}
                  >
                    <span className="w-24 shrink-0 text-[10px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                      {ROTULO_TIPO[resultado.tipo]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {resultado.titulo}
                      </span>
                      <span className="block truncate text-xs text-[var(--texto-3)]">
                        {resultado.subtitulo}
                        {resultado.detalhe ? ` · ${resultado.detalhe}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
