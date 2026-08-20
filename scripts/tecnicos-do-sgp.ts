/**
 * Cadastra os responsáveis que vieram do SGP e ainda não existem aqui.
 *
 *   npm run tecnicos:sgp              mostra o que faria, sem gravar
 *   npm run tecnicos:sgp -- --aplicar cadastra e vincula
 *
 * O SGP grava o responsável como texto digitado. Quando o técnico não existe
 * no cadastro daqui, a OS fica com o nome e sem vínculo — visível na tela, mas
 * fora da fila e do "Meu dia" dele. Este script fecha essa distância de uma
 * vez, em vez de exigir um cadastro manual por nome.
 *
 * Roda em seco por padrão: criar gente no sistema não é operação para
 * descobrir o resultado depois.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { criarTecnico } from "../src/lib/servicos/cadastros";
import {
  responsaveisSemCadastro,
  vincularOrdensDoNome,
} from "../src/lib/servicos/vinculo-tecnico";
import { normalizar } from "../src/lib/utils";

const aplicar = process.argv.includes("--aplicar");

/** "jercilanio" → "Jercilanio"; o SGP mistura caixa e a tela mostra o que vier */
function apresentavel(nome: string) {
  return nome
    .split(/\s+/)
    .map((p) =>
      p.length <= 2 && p === p.toLowerCase()
        ? p // "de", "da" ficam minúsculos
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase(),
    )
    .join(" ");
}

/** próxima matrícula livre no padrão T-000 */
async function proximaMatricula() {
  const tecnicos = await prisma.tecnico.findMany({ select: { matricula: true } });
  const usados = tecnicos
    .map((t) => Number(/^T-(\d+)$/.exec(t.matricula)?.[1]))
    .filter((n) => Number.isInteger(n));
  let proximo = (usados.length ? Math.max(...usados) : 0) + 1;
  return () => `T-${String(proximo++).padStart(3, "0")}`;
}

async function main() {
  const admin = await prisma.usuario.findFirst({
    where: { papel: "ADMIN", ativo: true },
    orderBy: { criadoEm: "asc" },
  });
  if (!admin) {
    console.error("\n  Nenhum administrador ativo para assinar a auditoria.\n");
    process.exit(1);
  }

  const pendentes = await responsaveisSemCadastro();
  if (!pendentes.length) {
    console.log("\n  Nenhum responsável do SGP sem cadastro. Nada a fazer.\n");
    return;
  }

  const existentes = await prisma.tecnico.findMany({
    select: { id: true, nome: true },
  });
  const porNome = new Map(existentes.map((t) => [normalizar(t.nome), t]));

  const gerarMatricula = await proximaMatricula();

  console.log(
    `\n  ${pendentes.length} responsável(is) do SGP sem vínculo${aplicar ? "" : "  ·  SIMULAÇÃO"}\n`,
  );

  let criados = 0;
  let vinculadas = 0;

  for (const pendente of pendentes) {
    const jaExiste = porNome.get(normalizar(pendente.nome));
    const nome = jaExiste?.nome ?? apresentavel(pendente.nome);
    const acao = jaExiste ? "vincular" : "cadastrar";

    if (!aplicar) {
      console.log(
        `  ${acao.padEnd(10)} ${nome.padEnd(24)} ${pendente.abertas} aberta(s) de ${pendente.total}`,
      );
      continue;
    }

    let tecnicoId = jaExiste?.id;
    if (!tecnicoId) {
      const criado = await criarTecnico(
        { nome, matricula: gerarMatricula(), telefone: null, equipeId: null },
        admin.id,
      );
      tecnicoId = criado.id;
      criados += 1;
    }

    const r = await vincularOrdensDoNome(tecnicoId, pendente.nome);
    vinculadas += r.vinculadas;
    console.log(
      `  ${nome.padEnd(24)} ${String(r.vinculadas).padStart(3)} OS vinculada(s)`,
    );
  }

  if (!aplicar) {
    console.log("\n  Nada foi gravado. Repita com --aplicar para valer.\n");
    return;
  }

  console.log(
    `\n  ─────────────────────────────────────────────\n  ${criados} técnico(s) cadastrado(s)\n  ${vinculadas} OS vinculada(s)\n`,
  );
  console.log(
    "  O login de cada um ainda precisa ser criado em Usuários e acesso,\n" +
      "  com o campo “Técnico vinculado” apontando para o cadastro.\n",
  );
}

main()
  .catch((erro) => {
    console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
