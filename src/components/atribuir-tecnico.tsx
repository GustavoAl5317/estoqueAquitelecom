"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { acaoAtribuirOrdem } from "@/app/acoes/operacao";

/**
 * Atribuição manual, sempre disponível — independente de a fila ter
 * recomendação ou não.
 *
 * A recomendação só existe quando o sistema consegue calcular distância (OS
 * com coordenada + técnico com posição conhecida). Sem isso, a fila mostra só
 * um aviso e ninguém consegue agir — o supervisor precisa poder escolher na
 * mão mesmo assim, porque o trabalho continua existindo mesmo sem GPS.
 */
export function AtribuirTecnico({
  ordemId,
  tecnicoAtualId,
  tecnicos,
}: {
  ordemId: string;
  tecnicoAtualId: string | null;
  tecnicos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function atribuir(tecnicoId: string) {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("ordemId", ordemId);
      dados.set("tecnicoId", tecnicoId);
      const resultado = await acaoAtribuirOrdem({}, dados);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  // sem ninguém cadastrado o seletor não teria o que oferecer — dizer isso
  // vale mais do que uma lista com uma opção morta
  if (tecnicos.length === 0) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-[var(--texto-3)]">
        <User className="size-3.5 shrink-0" aria-hidden />
        Nenhum técnico cadastrado —{" "}
        <Link
          href="/configuracoes"
          className="font-medium text-[var(--acento)] hover:underline"
        >
          cadastrar
        </Link>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <User className="size-3.5 shrink-0 text-[var(--texto-3)]" aria-hidden />
      <select
        defaultValue={tecnicoAtualId ?? ""}
        disabled={pendente}
        onChange={(evento) => evento.target.value && atribuir(evento.target.value)}
        className="!py-1 !text-xs"
        aria-label="Atribuir manualmente"
      >
        <option value="">Atribuir manualmente…</option>
        {tecnicos.map((tecnico) => (
          <option key={tecnico.id} value={tecnico.id}>
            {tecnico.nome}
          </option>
        ))}
      </select>
      {erro && (
        <span className="text-[11px] text-[var(--critico)]">{erro}</span>
      )}
    </div>
  );
}
