import { redirect } from "next/navigation";
import { Boxes, MapPin, PackageSearch, Route } from "lucide-react";
import { sessaoAtual } from "@/lib/auth";
import { telaInicial } from "@/lib/permissoes";
import { FormularioLogin } from "@/components/formulario-login";

export const dynamic = "force-dynamic";

/**
 * 3.66 — ENTRADA.
 *
 * Duas colunas em tela grande: o painel da esquerda diz o que o sistema faz,
 * porque quem entra aqui nem sempre sabe — técnico no primeiro acesso,
 * supervisor que usa uma vez por semana. Em tela pequena o painel some e sobra
 * só o formulário, que é o que importa no celular.
 */
const DESTAQUES = [
  {
    icone: PackageSearch,
    titulo: "Estoque rastreável",
    texto: "Onde está, com quem está e quanto ainda temos.",
  },
  {
    icone: MapPin,
    titulo: "Operação no mapa",
    texto: "Técnicos, ordens e equipamentos em tempo real.",
  },
  {
    icone: Route,
    titulo: "Roteiro do dia",
    texto: "Em que ordem atender, por proximidade e urgência.",
  },
];

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ destino?: string }>;
}) {
  const { destino } = await searchParams;
  const usuario = await sessaoAtual();
  if (usuario) redirect(destino ?? telaInicial(usuario.papel));

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.1fr_1fr]">
      {/* painel de apresentação */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-10 text-white lg:flex"
        style={{
          background:
            "linear-gradient(150deg, var(--acento) 0%, color-mix(in oklab, var(--acento) 55%, #0b1220) 60%, #0b1220 100%)",
        }}
      >
        {/* textura discreta, para o gradiente não ficar chapado */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-white/15 backdrop-blur">
            <Boxes className="size-5" aria-hidden />
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Plataforma Operacional</span>
            <span className="block text-[11px] tracking-wide text-white/60 uppercase">
              Aqui Telecom
            </span>
          </span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold tracking-tight">
            Estoque, ordens de serviço e campo — na mesma tela.
          </h2>
          <p className="mt-3 text-sm text-white/70">
            A qualquer momento: onde está cada material, quem está atendendo o
            quê, e o que precisa ser feito primeiro.
          </p>

          <ul className="mt-8 space-y-4">
            {DESTAQUES.map((item) => (
              <li key={item.titulo} className="flex gap-3">
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <item.icone className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{item.titulo}</span>
                  <span className="block text-xs text-white/60">{item.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[11px] text-white/40">
          Cada operação fica assinada com o nome de quem a executou.
        </p>
      </aside>

      {/* formulário */}
      <main className="flex items-center justify-center bg-[var(--superficie-2)] px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 lg:hidden">
            <span className="grid size-11 place-items-center rounded-xl bg-[var(--acento)] text-white">
              <Boxes className="size-6" aria-hidden />
            </span>
          </div>

          <h1 className="text-2xl font-semibold tracking-tight">Entrar</h1>
          <p className="mt-1 mb-6 text-sm text-[var(--texto-3)]">
            Use o e-mail e a senha da sua conta.
          </p>

          <div className="rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] p-5 shadow-[var(--sombra)]">
            <FormularioLogin destino={destino} />
          </div>

          <p className="mt-5 text-xs leading-relaxed text-[var(--texto-3)]">
            Esqueceu a senha? Peça a um administrador para redefinir — por
            segurança, ninguém consegue recuperá-la, apenas trocar.
          </p>
        </div>
      </main>
    </div>
  );
}
