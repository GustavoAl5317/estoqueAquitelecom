"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Moon, Sun, UserRound } from "lucide-react";
import { iniciais } from "@/lib/utils";
import { trocarUsuario } from "@/app/acoes/sessao";

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
 * 1.24 — enquanto o login do Bloco 3 não existe, o responsável pelas operações
 * é escolhido aqui e vai para todos os registros de auditoria.
 */
export function SeletorUsuario({
  usuarios,
  atualId,
}: {
  usuarios: { id: string; nome: string; papel: string }[];
  atualId: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const atual = usuarios.find((u) => u.id === atualId);

  return (
    <label className="flex items-center gap-2" title="Usuário responsável pelas operações">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[var(--acento-suave)] text-[11px] font-semibold text-[var(--acento-texto)]">
        {atual ? iniciais(atual.nome) : <UserRound className="size-4" />}
      </span>
      <select
        value={atualId}
        disabled={pendente}
        className="!w-auto max-w-44 !border-transparent !bg-transparent !py-1 !pl-0 text-sm"
        onChange={(evento) => {
          const id = evento.target.value;
          iniciar(async () => {
            await trocarUsuario(id);
            router.refresh();
          });
        }}
      >
        {usuarios.map((usuario) => (
          <option key={usuario.id} value={usuario.id}>
            {usuario.nome}
          </option>
        ))}
      </select>
    </label>
  );
}
