import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import "./globals.css";
import { NavegacaoLateral, NavegacaoMovel } from "@/components/navegacao";
import { BuscaGlobal } from "@/components/busca-global";
import { SeletorTema, SeletorUsuario } from "@/components/barra-superior";
import { usuarioAtual, usuariosDisponiveis } from "@/lib/sessao";
import { alertasDoEstoque } from "@/lib/servicos/alertas";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Estoque — Plataforma Operacional",
  description:
    "Controle e rastreabilidade de materiais e ativos: entrada, saída, técnicos, equipes, logística reversa e previsão de consumo.",
};

// evita o flash de tema errado antes da hidratação
const SCRIPT_TEMA = `try{var t=localStorage.getItem('tema');if(t){document.documentElement.dataset.theme=t}}catch(e){}`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [usuario, usuarios, alertas] = await Promise.all([
    usuarioAtual().catch(() => null),
    usuariosDisponiveis().catch(() => []),
    alertasDoEstoque().catch(() => []),
  ]);

  const criticos = alertas.filter((a) => a.severidade === "CRITICO").length;

  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full">
        <NavegacaoLateral />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sem-impressao sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--borda)] bg-[var(--superficie)]/95 px-4 py-2.5 backdrop-blur">
            <NavegacaoMovel />
            <BuscaGlobal />

            <div className="ml-auto flex items-center gap-2">
              <Link
                href="/alertas"
                className="relative grid size-9 place-items-center rounded-lg border border-[var(--borda-forte)] text-[var(--texto-2)] hover:text-[var(--texto)]"
                aria-label={`Alertas${alertas.length ? `: ${alertas.length}` : ""}`}
              >
                <AlertTriangle className="size-4" />
                {alertas.length > 0 && (
                  <span
                    className="absolute -top-1.5 -right-1.5 min-w-4.5 rounded-full px-1 text-[10px] leading-4.5 font-semibold text-white"
                    style={{
                      background: criticos
                        ? "var(--critico)"
                        : "var(--atencao)",
                    }}
                  >
                    {alertas.length}
                  </span>
                )}
              </Link>
              <SeletorTema />
              {usuario && (
                <SeletorUsuario usuarios={usuarios} atualId={usuario.id} />
              )}
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
