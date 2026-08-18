import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import "./globals.css";
import { NavegacaoLateral, NavegacaoMovel } from "@/components/navegacao";
import { BuscaGlobal } from "@/components/busca-global";
import { MenuUsuario, SeletorTema } from "@/components/barra-superior";
import { usuarioOpcional } from "@/lib/sessao";
import { capacidadesDe, podeAcessar, podeFazer } from "@/lib/permissoes";
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

/** telas que se desenham sozinhas, sem a casca do sistema */
const SEM_CASCA = ["/entrar", "/conta/senha", "/sem-acesso"];

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const cabecalhos = await headers();
  const caminho = cabecalhos.get("x-caminho") ?? "/";
  const usuario = await usuarioOpcional();

  const moldura = (conteudo: React.ReactNode) => (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="flex min-h-full">{conteudo}</body>
    </html>
  );

  // ---------------------------------------------------------------- sem sessão
  if (!usuario) {
    // o middleware já barra o que tem cookie ausente; aqui pega o cookie
    // inválido — sessão expirada ou usuário desativado no meio do expediente
    if (!SEM_CASCA.includes(caminho) && !caminho.startsWith("/api/")) {
      redirect("/entrar");
    }
    return moldura(<main className="flex min-w-0 flex-1">{children}</main>);
  }

  // 3.66 — quem foi obrigado a trocar a senha só sai da tela de senha
  if (usuario.trocarSenha && caminho !== "/conta/senha") {
    redirect("/conta/senha");
  }

  if (SEM_CASCA.includes(caminho)) {
    return moldura(<main className="flex min-w-0 flex-1">{children}</main>);
  }

  // 3.67 — a barreira que vale: papel contra a capacidade exigida pela rota
  if (!podeAcessar(usuario.papel, caminho)) redirect("/sem-acesso");

  const podeVerAlertas = podeFazer(usuario.papel, "estoque.ver");
  const alertas = podeVerAlertas ? await alertasDoEstoque().catch(() => []) : [];
  const criticos = alertas.filter((a) => a.severidade === "CRITICO").length;

  return moldura(
    <>
      <NavegacaoLateral capacidades={capacidadesDe(usuario.papel)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sem-impressao sticky top-0 z-30 flex items-center gap-3 border-b border-[var(--borda)] bg-[var(--superficie)]/95 px-4 py-2.5 backdrop-blur">
          <NavegacaoMovel capacidades={capacidadesDe(usuario.papel)} />
          {podeVerAlertas && <BuscaGlobal />}

          <div className="ml-auto flex items-center gap-2">
            {podeVerAlertas && (
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
                      background: criticos ? "var(--critico)" : "var(--atencao)",
                    }}
                  >
                    {alertas.length}
                  </span>
                )}
              </Link>
            )}
            <SeletorTema />
            <MenuUsuario usuario={usuario} />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </>,
  );
}
