import { redirect } from "next/navigation";
import { prisma } from "./prisma";
import { sessaoAtual, type UsuarioAutenticado } from "./auth";
import { podeFazer, type Capacidade } from "./permissoes";

/**
 * 1.24 / 3.66 — toda operação precisa de um responsável identificado.
 *
 * O usuário vem da sessão autenticada. Sem sessão não há operação: as funções
 * abaixo redirecionam para o login em vez de cair num usuário padrão, porque
 * auditoria assinada por "o sistema" não serve para nada.
 */
export async function usuarioAtual(): Promise<UsuarioAutenticado> {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/entrar");
  return usuario;
}

/** Versão que não redireciona — para o layout, que renderiza o login também. */
export async function usuarioOpcional() {
  return sessaoAtual();
}

/**
 * Barreira de capacidade para uma página ou server action.
 *
 * Chamada no servidor, antes de qualquer leitura: esconder o botão no cliente
 * organiza a tela, não protege o dado.
 */
export async function exigir(capacidade: Capacidade) {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, capacidade)) redirect("/sem-acesso");
  return usuario;
}

export async function usuariosDisponiveis() {
  return prisma.usuario.findMany({
    where: { ativo: true },
    orderBy: { nome: "asc" },
  });
}
