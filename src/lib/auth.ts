import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

/**
 * 3.66 — AUTENTICAÇÃO.
 *
 * Senha guardada com scrypt, do módulo `crypto` do próprio Node. É uma função
 * deliberadamente lenta e com custo de memória, desenhada para senha — o que
 * significa que descobrir a original por força bruta custa caro mesmo com o
 * banco em mãos. Não entra dependência nova no projeto por causa disso.
 *
 * O cookie carrega apenas um token aleatório de 32 bytes. Quem sabe quem é o
 * usuário é o banco; o navegador só guarda o bilhete.
 */

const derivar = promisify(scrypt) as (
  senha: string,
  sal: string,
  tamanho: number,
) => Promise<Buffer>;

const COOKIE = "sessao";
const DIAS_DE_SESSAO = 7;
const TAMANHO_HASH = 64;

export async function gerarHash(senha: string) {
  const sal = randomBytes(16).toString("hex");
  const hash = await derivar(senha, sal, TAMANHO_HASH);
  return `${sal}:${hash.toString("hex")}`;
}

export async function conferirSenha(senha: string, armazenado: string | null) {
  if (!armazenado) return false;

  const [sal, hashEsperado] = armazenado.split(":");
  if (!sal || !hashEsperado) return false;

  const calculado = await derivar(senha, sal, TAMANHO_HASH);
  const esperado = Buffer.from(hashEsperado, "hex");

  // comparação de tempo constante: comparar com === vazaria, pelo tempo de
  // resposta, quantos caracteres iniciais estavam certos
  if (calculado.length !== esperado.length) return false;
  return timingSafeEqual(calculado, esperado);
}

export class ErroDeLogin extends Error {}

/**
 * A mensagem de erro é a mesma para e-mail inexistente e senha errada. Dizer
 * "usuário não encontrado" entrega quais e-mails existem no sistema.
 */
const CREDENCIAL_INVALIDA = "E-mail ou senha incorretos.";

export async function autenticar(
  email: string,
  senha: string,
  agente?: string | null,
) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  if (!usuario || !usuario.ativo) throw new ErroDeLogin(CREDENCIAL_INVALIDA);
  if (!(await conferirSenha(senha, usuario.senhaHash))) {
    throw new ErroDeLogin(CREDENCIAL_INVALIDA);
  }

  const token = randomBytes(32).toString("hex");
  const expiraEm = new Date(Date.now() + DIAS_DE_SESSAO * 86_400_000);

  await prisma.sessao.create({
    data: {
      token,
      usuarioId: usuario.id,
      expiraEm,
      agente: agente?.slice(0, 200) ?? null,
    },
  });

  await prisma.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() },
  });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });

  // limpeza oportunista das sessões vencidas
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });

  return usuario;
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await prisma.sessao.deleteMany({ where: { token } });
  jar.delete(COOKIE);
}

export type UsuarioAutenticado = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  trocarSenha: boolean;
  tecnicoId: string | null;
};

/** O usuário da sessão atual, ou null quando não há sessão válida. */
export async function sessaoAtual(): Promise<UsuarioAutenticado | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const sessao = await prisma.sessao.findUnique({
    where: { token },
    include: { usuario: { include: { tecnico: { select: { id: true } } } } },
  });

  if (!sessao || sessao.expiraEm < new Date() || !sessao.usuario.ativo) {
    return null;
  }

  return {
    id: sessao.usuario.id,
    nome: sessao.usuario.nome,
    email: sessao.usuario.email,
    papel: sessao.usuario.papel,
    trocarSenha: sessao.usuario.trocarSenha,
    tecnicoId: sessao.usuario.tecnico?.id ?? null,
  };
}

export async function definirSenha(
  usuarioId: string,
  senha: string,
  { obrigarTroca = false }: { obrigarTroca?: boolean } = {},
) {
  if (senha.length < 8) {
    throw new ErroDeLogin("A senha precisa ter ao menos 8 caracteres.");
  }
  await prisma.usuario.update({
    where: { id: usuarioId },
    data: { senhaHash: await gerarHash(senha), trocarSenha: obrigarTroca },
  });
}

/** Trocar a senha derruba as outras sessões — é o ponto de trocar. */
export async function trocarPropriaSenha(
  usuarioId: string,
  senhaAtual: string,
  senhaNova: string,
) {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario) throw new ErroDeLogin("Usuário não encontrado.");

  if (usuario.senhaHash && !(await conferirSenha(senhaAtual, usuario.senhaHash))) {
    throw new ErroDeLogin("A senha atual está incorreta.");
  }

  await definirSenha(usuarioId, senhaNova);

  const jar = await cookies();
  const atual = jar.get(COOKIE)?.value;
  await prisma.sessao.deleteMany({
    where: { usuarioId, token: atual ? { not: atual } : undefined },
  });
}

export const COOKIE_SESSAO = COOKIE;
