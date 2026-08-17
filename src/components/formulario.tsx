"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Aviso, Botao } from "./ui";
import type { Resultado } from "@/app/acoes/estoque";

type Acao = (estado: Resultado, dados: FormData) => Promise<Resultado>;

/**
 * Envolve uma server action exibindo erro de regra de negócio no próprio
 * formulário, sem perder o que já foi preenchido.
 */
export function FormularioAcao({
  acao,
  children,
  className,
  aoConcluir,
}: {
  acao: Acao;
  children: ReactNode;
  className?: string;
  aoConcluir?: ReactNode;
}) {
  const [estado, enviar] = useActionState<Resultado, FormData>(acao, {});

  return (
    <form action={enviar} className={className}>
      {estado.erro && (
        <div className="mb-3">
          <Aviso tom="critico" titulo="Não foi possível concluir">
            {estado.erro}
          </Aviso>
        </div>
      )}
      {estado.ok && aoConcluir && <div className="mb-3">{aoConcluir}</div>}
      {children}
    </form>
  );
}

export function BotaoEnviar({
  children,
  variante = "primario",
  className,
}: {
  children: ReactNode;
  variante?: "primario" | "secundario" | "sutil" | "perigo";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" variante={variante} disabled={pending} className={className}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {children}
    </Botao>
  );
}

/** ação de uma linha só: botão que dispara a server action com campos ocultos */
export function AcaoRapida({
  acao,
  campos,
  children,
  variante = "secundario",
  confirmacao,
}: {
  acao: Acao;
  campos: Record<string, string>;
  children: ReactNode;
  variante?: "primario" | "secundario" | "sutil" | "perigo";
  confirmacao?: string;
}) {
  const [estado, enviar] = useActionState<Resultado, FormData>(acao, {});

  return (
    <form
      action={enviar}
      onSubmit={(evento) => {
        if (confirmacao && !window.confirm(confirmacao)) evento.preventDefault();
      }}
      className="inline-flex flex-col items-start gap-1"
    >
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <BotaoEnviar variante={variante}>{children}</BotaoEnviar>
      {estado.erro && (
        <span className="text-xs text-[var(--critico)]">{estado.erro}</span>
      )}
    </form>
  );
}
