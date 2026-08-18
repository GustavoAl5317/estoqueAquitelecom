import Link from "next/link";
import { ShieldOff } from "lucide-react";
import { usuarioAtual } from "@/lib/sessao";
import { PAPEL_USUARIO } from "@/lib/dominio";
import { telaInicial } from "@/lib/permissoes";

export const dynamic = "force-dynamic";

export default async function SemAcesso() {
  const usuario = await usuarioAtual();

  return (
    <div className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[var(--atencao-suave)] text-[var(--atencao)]">
          <ShieldOff className="size-6" aria-hidden />
        </span>

        <h1 className="text-xl font-semibold tracking-tight">
          Esta área não faz parte do seu perfil
        </h1>

        <p className="mt-2 text-sm text-[var(--texto-2)]">
          Você está como{" "}
          <strong>{PAPEL_USUARIO.rotulo(usuario.papel)}</strong>. Se precisa
          desta tela para trabalhar, peça a um administrador para revisar seu
          perfil — o acesso é concedido por função, não por tela.
        </p>

        <Link
          href={telaInicial(usuario.papel)}
          className="mt-5 inline-flex items-center rounded-lg bg-[var(--acento)] px-4 py-2 text-sm font-medium text-white"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
