import Link from "next/link";
import { KeyRound } from "lucide-react";
import { usuarioAtual } from "@/lib/sessao";
import { telaInicial } from "@/lib/permissoes";
import { FormularioSenha } from "@/components/formulario-login";

export const dynamic = "force-dynamic";

export default async function TrocarSenha() {
  const usuario = await usuarioAtual();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--superficie-2)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-11 place-items-center rounded-[var(--raio)] bg-[var(--acento)] text-white">
            <KeyRound className="size-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">Trocar senha</h1>
          <p className="text-sm text-[var(--texto-3)]">{usuario.email}</p>
        </div>

        <div className="rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] p-5 shadow-[var(--sombra)]">
          <FormularioSenha primeiroAcesso={usuario.trocarSenha} />
        </div>

        {!usuario.trocarSenha && (
          <p className="mt-4 text-center text-xs">
            <Link
              href={telaInicial(usuario.papel)}
              className="text-[var(--texto-3)] hover:text-[var(--acento)]"
            >
              Voltar sem trocar
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
