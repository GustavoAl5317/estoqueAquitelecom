"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ScanLine } from "lucide-react";
import { Botao } from "./ui";

/**
 * Campo de leitura contínua: o leitor de código de barras digita e envia,
 * então o formulário navega sozinho e volta a focar para a próxima peça.
 */
export function LeitorDeCodigo({ valorInicial }: { valorInicial?: string }) {
  const router = useRouter();
  const campo = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState(valorInicial ?? "");
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const codigo = valor.trim();
    if (!codigo) return;
    setIndo(true);
    router.push(`/q/${encodeURIComponent(codigo)}`);
  }

  return (
    <form onSubmit={enviar} className="flex gap-2">
      <div className="relative flex-1">
        <ScanLine
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--texto-3)]"
          aria-hidden
        />
        <input
          ref={campo}
          type="text"
          value={valor}
          autoComplete="off"
          spellCheck={false}
          placeholder="Escaneie ou digite o identificador"
          className="!pl-9 font-mono"
          onChange={(e) => setValor(e.target.value)}
        />
      </div>
      <Botao type="submit" variante="primario" disabled={indo || !valor.trim()}>
        {indo && <Loader2 className="size-4 animate-spin" />}
        Abrir
      </Botao>
    </form>
  );
}
