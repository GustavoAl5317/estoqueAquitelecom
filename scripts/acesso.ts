/**
 * Diagnóstico e reparo de acesso.
 *
 *   npm run acesso                        situação de cada usuário
 *   npm run acesso -- --testar E-MAIL SENHA     confere uma credencial
 *   npm run acesso -- --senha E-MAIL SENHA      define uma senha nova
 *
 * Existe porque "o login não funciona" tem cinco causas possíveis — banco
 * vazio, arquivo de banco diferente do que a aplicação lê, usuário sem senha,
 * senha errada, usuário inativo — e adivinhar qual delas é custa mais tempo do
 * que perguntar ao banco.
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { prisma } from "../src/lib/prisma";
import { conferirSenha, definirSenha } from "../src/lib/auth";

const argv = process.argv.slice(2);
const opcao = (nome: string) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? argv.slice(i + 1, i + 3) : null;
};

function arquivoDoBanco() {
  const url = process.env.DATABASE_URL ?? "";
  const doEnv = process.env.DATABASE_FILE;
  const caminho =
    doEnv ??
    (url.startsWith("file:")
      ? path.resolve(process.cwd(), url.slice(5))
      : path.join(process.cwd(), "prisma", "dev.db"));

  const existe = fs.existsSync(caminho);
  const tamanho = existe ? fs.statSync(caminho).size : 0;
  return { caminho, existe, tamanho };
}

async function situacao() {
  const banco = arquivoDoBanco();

  console.log("\n  BANCO");
  console.log(`    arquivo : ${banco.caminho}`);
  console.log(
    `    estado  : ${
      !banco.existe
        ? "NÃO EXISTE — rode npx prisma migrate deploy"
        : banco.tamanho < 50_000
          ? `${Math.round(banco.tamanho / 1024)} KB — parece vazio, rode npm run db:seed`
          : `${Math.round(banco.tamanho / 1024)} KB`
    }`,
  );
  console.log(`    DATABASE_URL: ${process.env.DATABASE_URL ?? "(não definida)"}`);

  const usuarios = await prisma.usuario.findMany({ orderBy: { papel: "asc" } });

  console.log(`\n  USUÁRIOS (${usuarios.length})\n`);
  if (!usuarios.length) {
    console.log("    Nenhum. A base está vazia — rode: npm run db:seed\n");
    return;
  }

  console.log(
    `    ${"e-mail".padEnd(34)} ${"papel".padEnd(13)} ${"senha".padEnd(12)} situação`,
  );
  console.log(`    ${"-".repeat(78)}`);

  for (const u of usuarios) {
    console.log(
      `    ${u.email.padEnd(34)} ${u.papel.padEnd(13)} ${(u.senhaHash
        ? u.trocarSenha
          ? "troca obrig."
          : "definida"
        : "SEM SENHA"
      ).padEnd(12)} ${u.ativo ? "ativo" : "INATIVO"}`,
    );
  }

  console.log(
    "\n    Para conferir uma credencial:  npm run acesso -- --testar admin@operacao.local estoque2026",
  );
  console.log(
    "    Para trocar uma senha:         npm run acesso -- --senha admin@operacao.local NovaSenha123\n",
  );
}

async function testar(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });

  console.log("");
  if (!usuario) {
    console.log(`  ✗ Não existe usuário com o e-mail ${email}.`);
    console.log("    Confira a lista com: npm run acesso\n");
    return;
  }
  if (!usuario.ativo) {
    console.log(`  ✗ ${usuario.nome} está inativo — o login é recusado.\n`);
    return;
  }
  if (!usuario.senhaHash) {
    console.log(`  ✗ ${usuario.nome} não tem senha definida.`);
    console.log(`    Defina com: npm run acesso -- --senha ${email} SuaSenha123\n`);
    return;
  }

  const confere = await conferirSenha(senha, usuario.senhaHash);
  console.log(
    confere
      ? `  ✓ Credencial válida para ${usuario.nome} (${usuario.papel}).` +
          (usuario.trocarSenha
            ? "\n    Ele entra, mas cai direto na tela de troca de senha."
            : "")
      : `  ✗ Senha incorreta para ${usuario.nome}.`,
  );
  console.log("");
}

async function trocar(email: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!usuario) {
    console.log(`\n  ✗ Não existe usuário com o e-mail ${email}.\n`);
    return;
  }

  await definirSenha(usuario.id, senha);
  await prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } });

  console.log(`\n  ✓ Senha de ${usuario.nome} definida.`);
  console.log("    As sessões abertas desse usuário foram encerradas.\n");
}

async function main() {
  const testarArgs = opcao("testar");
  if (testarArgs) return testar(testarArgs[0], testarArgs[1]);

  const senhaArgs = opcao("senha");
  if (senhaArgs) return trocar(senhaArgs[0], senhaArgs[1]);

  return situacao();
}

main()
  .catch((erro) => {
    console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
