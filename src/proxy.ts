import { NextResponse, type NextRequest } from "next/server";

/**
 * 3.66 — primeira barreira, e a mais barata.
 *
 * `proxy` é o nome que o Next 16 deu ao antigo `middleware`. Ele roda antes da
 * renderização, sem acesso ao banco, então **não** valida a sessão — só
 * verifica se existe um cookie. Quem confere se o token é válido e se o papel
 * permite a rota é o layout, que roda no servidor com Prisma.
 *
 * A divisão é proposital: aqui se corta o tráfego de quem nem cookie tem, sem
 * pagar uma consulta; lá se decide de verdade.
 *
 * O caminho também é repassado em um cabeçalho, porque um layout de servidor
 * não recebe a URL da requisição.
 */

const LIVRES = ["/entrar", "/api/rastreador", "/q/"];

export function proxy(requisicao: NextRequest) {
  const { pathname } = requisicao.nextUrl;

  const cabecalhos = new Headers(requisicao.headers);
  cabecalhos.set("x-caminho", pathname);

  const livre = LIVRES.some(
    (rota) => pathname === rota || pathname.startsWith(rota),
  );
  const temCookie = requisicao.cookies.has("sessao");

  if (!livre && !temCookie) {
    const destino = new URL("/entrar", requisicao.url);
    // guarda para onde a pessoa queria ir, e devolve depois do login
    if (pathname !== "/") destino.searchParams.set("destino", pathname);
    return NextResponse.redirect(destino);
  }

  return NextResponse.next({ request: { headers: cabecalhos } });
}

export const config = {
  matcher: [
    /*
     * Tudo, menos `_next` e arquivos estáticos.
     *
     * O `_next` inteiro fica de fora, não só `_next/static`: o canal de
     * recarregamento do modo de desenvolvimento vive em `_next/hmr`, e
     * redirecionar esse pedido para a tela de login derruba o JavaScript da
     * página — o formulário aparece e não envia nada.
     */
    "/((?!_next/|favicon.ico|.*\.(?:png|jpg|jpeg|svg|ico|webp)$).*)",
  ],
};
