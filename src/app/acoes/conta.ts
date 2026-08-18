"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  ErroDeLogin,
  autenticar,
  definirSenha,
  encerrarSessao,
  trocarPropriaSenha,
} from "@/lib/auth";
import { usuarioAtual } from "@/lib/sessao";
import { podeFazer } from "@/lib/permissoes";
import { telaInicial } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";
import { auditar } from "@/lib/servicos/nucleo";
import type { Resultado } from "./estoque";

/**
 * 3.66 — entrar, sair e trocar senha.
 *
 * `redirect` do Next funciona lançando uma exceção; por isso ele fica **fora**
 * do try, senão o catch engoliria o redirecionamento e o login pareceria ter
 * falhado depois de dar certo.
 */
export async function acaoEntrar(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  let destino: string;

  try {
    const cabecalhos = await headers();
    const usuario = await autenticar(
      String(dados.get("email") ?? ""),
      String(dados.get("senha") ?? ""),
      cabecalhos.get("user-agent"),
    );
    destino = usuario.senhaHash && !usuario.trocarSenha
      ? telaInicial(usuario.papel)
      : "/conta/senha";
  } catch (erro) {
    if (erro instanceof ErroDeLogin) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível entrar. Tente novamente." };
  }

  redirect(destino);
}

export async function acaoSair() {
  await encerrarSessao();
  redirect("/entrar");
}

export async function acaoTrocarSenha(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const nova = String(dados.get("senhaNova") ?? "");

  if (nova !== String(dados.get("confirmacao") ?? "")) {
    return { erro: "A confirmação não confere com a nova senha." };
  }

  try {
    await trocarPropriaSenha(
      usuario.id,
      String(dados.get("senhaAtual") ?? ""),
      nova,
    );
  } catch (erro) {
    if (erro instanceof ErroDeLogin) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível trocar a senha." };
  }

  redirect(telaInicial(usuario.papel));
}

/** 3.67 — o administrador define a senha inicial de outro usuário. */
export async function acaoDefinirSenhaDe(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite definir a senha de outro usuário." };
  }

  const alvoId = String(dados.get("usuarioId") ?? "");
  const senha = String(dados.get("senha") ?? "");

  try {
    const alvo = await prisma.usuario.findUnique({ where: { id: alvoId } });
    if (!alvo) return { erro: "Usuário não encontrado." };

    // obriga a troca: quem definiu a senha não deve continuar sabendo dela
    await definirSenha(alvoId, senha, { obrigarTroca: true });

    await auditar(prisma, {
      entidade: "Usuario",
      entidadeId: alvoId,
      acao: "EDICAO",
      descricao: `Senha de ${alvo.nome} redefinida. Troca obrigatória no próximo acesso.`,
      usuarioId: usuario.id,
    });
  } catch (erro) {
    if (erro instanceof ErroDeLogin) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível definir a senha." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}

export async function acaoSalvarUsuario(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite gerenciar usuários." };
  }

  const id = String(dados.get("usuarioId") ?? "");
  const nome = String(dados.get("nome") ?? "").trim();
  const email = String(dados.get("email") ?? "").trim().toLowerCase();
  const papel = String(dados.get("papel") ?? "VISUALIZACAO");
  const ativo = dados.get("ativo") === "on" || dados.get("ativo") === "true";

  if (!nome) return { erro: "Informe o nome." };
  if (!email.includes("@")) return { erro: "Informe um e-mail válido." };

  try {
    if (id) {
      // um administrador não pode se rebaixar e deixar o sistema sem dono
      if (id === usuario.id && papel !== "ADMIN") {
        return { erro: "Você não pode remover o próprio acesso de administrador." };
      }
      await prisma.usuario.update({
        where: { id },
        data: { nome, email, papel, ativo },
      });
      if (!ativo) await prisma.sessao.deleteMany({ where: { usuarioId: id } });
    } else {
      const criado = await prisma.usuario.create({
        data: { nome, email, papel, ativo: true, trocarSenha: true },
      });
      const senha = String(dados.get("senha") ?? "");
      if (senha) await definirSenha(criado.id, senha, { obrigarTroca: true });
    }
  } catch (erro) {
    if (erro instanceof ErroDeLogin) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível salvar. O e-mail já pode estar em uso." };
  }

  revalidatePath("/usuarios");
  return { ok: true };
}
