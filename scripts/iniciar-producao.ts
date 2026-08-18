/**
 * Prepara a instalação para uso real.
 *
 *   npm run producao -- --admin "Seu Nome" seu@email.com SuaSenha123
 *
 * O que ele faz:
 *   1. apaga tudo — inclusive a marca de base de demonstração;
 *   2. cria o usuário administrador que você informou;
 *   3. importa da plataforma de rastreamento os aparelhos que existem de verdade.
 *
 * O que ele NÃO faz, porque não há de onde: materiais, saldos e ordens de
 * serviço. Ao final ele diz exatamente o que ficou faltando e por quê — é mais
 * honesto do que deixar a base pela metade sem avisar.
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { prisma } from "../src/lib/prisma";
import { gerarHash } from "../src/lib/auth";
import { importarDispositivos, verificarConexao } from "../src/lib/servicos/traccar";

const argv = process.argv.slice(2);
const opcao = (nome: string, quantos: number) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? argv.slice(i + 1, i + 1 + quantos) : null;
};

/** ordem de exclusão: quem aponta vai antes de quem é apontado */
const TABELAS = [
  "posicao",
  "rastreador",
  "vinculoVeiculo",
  "veiculo",
  "movimentacaoItemSerial",
  "movimentacaoItem",
  "movimento",
  "triagem",
  "reserva",
  "inventarioItem",
  "inventario",
  "divergencia",
  "movimentacao",
  "entradaItem",
  "entrada",
  "unidadeSerial",
  "saldo",
  "auditoria",
  "eventoOS",
  "visaoSalva",
  "sessao",
  "materialPrevistoOS",
  "ordemServico",
  "localizacaoTecnico",
  "bairro",
  "regiao",
  "detentor",
  "material",
  "categoria",
  "fornecedor",
  "estoque",
  "tecnico",
  "equipe",
  "usuario",
  "configuracao",
] as const;

async function limpar() {
  const cliente = prisma as unknown as Record<
    string,
    { deleteMany: () => Promise<{ count: number }> }
  >;

  let total = 0;
  for (const nome of TABELAS) {
    const tabela = cliente[nome];
    if (!tabela) {
      throw new Error(
        `A tabela "${nome}" não existe no cliente Prisma.\n` +
          `Rode:  npx prisma generate`,
      );
    }
    const { count } = await tabela.deleteMany();
    total += count;
  }
  return total;
}

async function confirmar(pergunta: string) {
  // sem terminal interativo (pipeline, cron) não há como confirmar: recusa
  if (!process.stdin.isTTY) {
    throw new Error(
      "Este comando apaga a base e exige confirmação num terminal interativo.",
    );
  }
  const leitor = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const resposta = await leitor.question(pergunta);
  leitor.close();
  return resposta.trim().toUpperCase() === "APAGAR";
}

async function main() {
  const admin = opcao("admin", 3);
  if (!admin || admin.length < 3) {
    console.log(`
  Prepara a instalação para uso real.

    npm run producao -- --admin "Seu Nome" seu@email.com SuaSenha123

  Apaga TUDO, cria o administrador informado e importa os aparelhos reais da
  plataforma de rastreamento.
`);
    return;
  }

  const [nome, email, senha] = admin;
  if (senha.length < 8) {
    throw new Error("A senha do administrador precisa ter ao menos 8 caracteres.");
  }

  const usuariosAtuais = await prisma.usuario.count();
  const materiaisAtuais = await prisma.material.count();

  console.log(`
  Base atual: ${usuariosAtuais} usuário(s), ${materiaisAtuais} material(is).

  Tudo isso será APAGADO e não há como desfazer.
`);

  if (!(await confirmar('  Digite APAGAR para confirmar: '))) {
    console.log("\n  Cancelado. Nada foi alterado.\n");
    return;
  }

  console.log("\n  Limpando…");
  const apagados = await limpar();
  console.log(`    ${apagados} registro(s) removido(s).`);

  console.log("  Criando administrador…");
  await prisma.usuario.create({
    data: {
      nome,
      email: email.trim().toLowerCase(),
      papel: "ADMIN",
      senhaHash: await gerarHash(senha),
    },
  });
  console.log(`    ${nome} <${email}>`);

  // ------------------------------------------------------------ rastreamento
  let rastreadores = 0;
  try {
    const conexao = await verificarConexao();
    console.log(
      `  Traccar ${conexao.versao}: ${conexao.dispositivos} aparelho(s), ${conexao.online} online.`,
    );
    const resultado = await importarDispositivos();
    rastreadores = resultado.total;
    console.log(`    ${resultado.criados.length} importado(s).`);
  } catch (erro) {
    console.log(
      `  Traccar indisponível: ${erro instanceof Error ? erro.message : erro}`,
    );
    console.log("    Preencha TRACCAR_USUARIO e TRACCAR_SENHA no .env e rode:");
    console.log("      npm run traccar -- --importar");
  }

  console.log(`
  ─────────────────────────────────────────────────────────────
  BASE PRONTA PARA USO REAL

  Já carregado:
    · ${rastreadores} aparelho(s) de rastreamento, vindos da plataforma

  Falta carregar, porque não existe fonte automática:

    1. CLASSIFICAR OS APARELHOS       /central
       Dizer o que cada um rastreia: carro, celular de técnico ou
       equipamento. O sistema não adivinha por nome.

    2. TÉCNICOS, EQUIPES E ESTOQUES   /locais e /usuarios
       Poucos registros, cadastro manual.

    3. MATERIAIS E SALDO INICIAL      /materiais e /inventario/novo
       O estoque não vem do SGP — é sistema à parte, sem API. A carga
       inicial é uma contagem física digitada no inventário.

    4. ORDENS DE SERVIÇO              /os/nova
       Manual até o SGP liberar a leitura de OS para o usuário do token.

  Entre com ${email} e a senha que você definiu.
  ─────────────────────────────────────────────────────────────
`);
}

main()
  .catch((erro) => {
    console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
