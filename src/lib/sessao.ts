import { cookies } from "next/headers";
import { prisma } from "./prisma";

const COOKIE = "usuario";

/**
 * 1.24 — toda operação precisa de um responsável identificado.
 *
 * A plataforma ainda não tem tela de login (Bloco 3, item 3.66). Até lá, o
 * usuário ativo vem de um cookie e cai no administrador padrão, de modo que a
 * auditoria nunca fique sem autor.
 */
export async function usuarioAtual() {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;

  if (id) {
    const usuario = await prisma.usuario.findUnique({ where: { id } });
    if (usuario?.ativo) return usuario;
  }

  const padrao = await prisma.usuario.findFirst({
    where: { ativo: true },
    orderBy: { criadoEm: "asc" },
  });
  if (!padrao) {
    throw new Error(
      "Nenhum usuário cadastrado. Rode `npm run db:seed` para popular a base.",
    );
  }
  return padrao;
}

export async function usuariosDisponiveis() {
  return prisma.usuario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
  });
}

export const COOKIE_USUARIO = COOKIE;
