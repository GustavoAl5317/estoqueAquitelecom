"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Moon, Sun } from "lucide-react";
import { PAPEL_USUARIO } from "@/lib/dominio";
import { iniciais } from "@/lib/utils";
import { acaoSair } from "@/app/acoes/conta";

export function SeletorTema() {
  const [escuro, setEscuro] = useState<boolean | null>(null);

  useEffect(() => {
    const salvo = localStorage.getItem("tema");
    const preferencia = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setEscuro(salvo ? salvo === "dark" : preferencia);
  }, []);

  function alternar() {
    const proximo = !escuro;
    setEscuro(proximo);
    document.documentElement.dataset.theme = proximo ? "dark" : "light";
    localStorage.setItem("tema", proximo ? "dark" : "light");
  }

  return (
    <button
      type="button"
      onClick={alternar}
      className="grid size-9 place-items-center rounded-lg border border-[var(--borda-forte)] text-[var(--texto-2)] hover:text-[var(--texto)]"
      aria-label={escuro ? "Usar tema claro" : "Usar tema escuro"}
    >
      {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

/**
 * 3.66 — quem está usando o sistema, e a porta de saída.
 *
 * O nome não é decoração: é ele que assina cada movimentação na auditoria.
 * Deixar visível quem está logado evita a operação inteira ser registrada no
 * usuário de quem esqueceu a sessão aberta.
 */
export function MenuUsuario({
  usuario,
}: {
  usuario: { nome: string; email: string; papel: string };
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex items-center gap-2 rounded-lg border border-[var(--borda-forte)] py-1 pr-2 pl-1"
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--acento-suave)] text-[11px] font-semibold text-[var(--acento-texto)]">
          {iniciais(usuario.nome)}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-32 truncate text-xs font-medium">
            {usuario.nome}
          </span>
          <span className="block text-[10px] text-[var(--texto-3)]">
            {PAPEL_USUARIO.rotulo(usuario.papel)}
          </span>
        </span>
        <ChevronDown className="size-3.5 text-[var(--texto-3)]" aria-hidden />
      </button>

      {aberto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div
            className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] shadow-[var(--sombra-alta)]"
            role="menu"
          >
            <div className="border-b border-[var(--borda)] px-3 py-2">
              <p className="truncate text-sm font-medium">{usuario.nome}</p>
              <p className="truncate text-xs text-[var(--texto-3)]">
                {usuario.email}
              </p>
            </div>

            <Link
              href="/conta/senha"
              onClick={() => setAberto(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--superficie-3)]"
              role="menuitem"
            >
              <KeyRound className="size-4" aria-hidden /> Trocar senha
            </Link>

            <form action={acaoSair}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--critico)] hover:bg-[var(--superficie-3)]"
                role="menuitem"
              >
                <LogOut className="size-4" aria-hidden /> Sair
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
