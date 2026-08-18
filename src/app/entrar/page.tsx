import { redirect } from "next/navigation";
import { Boxes } from "lucide-react";
import { sessaoAtual } from "@/lib/auth";
import { telaInicial } from "@/lib/permissoes";
import { FormularioLogin } from "@/components/formulario-login";

export const dynamic = "force-dynamic";

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;
  const usuario = await sessaoAtual();
  if (usuario) redirect(destino ?? telaInicial(usuario.papel));

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--superficie-2)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid size-11 place-items-center rounded-[var(--raio)] bg-[var(--acento)] text-white">
            <Boxes className="size-6" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold tracking-tight">
            Plataforma Operacional
          </h1>
          <p className="text-sm text-[var(--texto-3)]">
            Estoque, ordens de serviço e operação de campo.
          </p>
        </div>

        <div className="rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] p-5 shadow-[var(--sombra)]">
          <FormularioLogin destino={destino} />
        </div>

        <p className="mt-4 text-center text-xs text-[var(--texto-3)]">
          Cada operação registrada no sistema fica assinada com o seu nome.
        </p>
      </div>
    </div>
  );
}
