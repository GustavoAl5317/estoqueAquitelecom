/**
 * Manda para o SGP o responsável de toda OS que já tem técnico aqui.
 *
 * É o acerto de uma vez: o que foi atribuído antes de a escrita existir não
 * chegou lá. Daqui para a frente cada atribuição avisa sozinha, se a
 * notificação estiver ligada na Central.
 *
 * Roda em seco por padrão. `--aplicar` escreve na produção do cliente, uma OS
 * por vez, com intervalo — o 403 deste SGP é limite de requisição.
 *
 * Uso:
 *   npm run sgp:responsaveis
 *   npm run sgp:responsaveis -- --aplicar
 *   npm run sgp:responsaveis -- --aplicar --intervalo 6
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  gravarResponsavelNoSgp,
  loginSgpDoTecnico,
} from "@/lib/servicos/sgp-notificacao";
import { STATUS_OS_ABERTOS } from "@/lib/dominio";

const argv = process.argv.slice(2);
const aplicar = argv.includes("--aplicar");
const incluirEncerradas = argv.includes("--todas");
const intervalo = Number(argv[argv.indexOf("--intervalo") + 1]) || 4;

async function main() {
  const ordens = await prisma.ordemServico.findMany({
    where: {
      origem: "SGP",
      idSgp: { not: null },
      tecnicoId: { not: null },
      ...(incluirEncerradas ? {} : { status: { in: STATUS_OS_ABERTOS } }),
    },
    select: {
      id: true,
      numero: true,
      idSgp: true,
      cliente: true,
      tecnicoId: true,
      tecnico: { select: { nome: true } },
    },
    orderBy: { abertaEm: "desc" },
  });

  if (!ordens.length) {
    console.log("\n  Nenhuma OS do SGP com técnico atribuído aqui.\n");
    return;
  }

  // o login é por técnico, não por OS: resolve uma vez cada
  const logins = new Map<string, { login: string | null; origem: string }>();
  for (const ordem of ordens) {
    if (!logins.has(ordem.tecnicoId!)) {
      logins.set(ordem.tecnicoId!, await loginSgpDoTecnico(ordem.tecnicoId!));
    }
  }

  console.log(`\n  ${ordens.length} OS com técnico${aplicar ? "" : "  ·  SIMULAÇÃO"}\n`);
  console.log("  Login de cada técnico:");
  for (const [tecnicoId, r] of logins) {
    const nome = ordens.find((o) => o.tecnicoId === tecnicoId)!.tecnico!.nome;
    console.log(
      `    ${nome.padEnd(22)} ${r.login ? `"${r.login}"` : "— SEM LOGIN"}  (${r.origem})`,
    );
  }

  const semLogin = ordens.filter((o) => !logins.get(o.tecnicoId!)?.login);
  if (semLogin.length) {
    console.log(
      `\n  ${semLogin.length} OS ficam de fora por falta de login do técnico no SGP.`,
    );
  }

  const enviaveis = ordens.filter((o) => logins.get(o.tecnicoId!)?.login);

  if (!aplicar) {
    console.log(`\n  ${enviaveis.length} seriam enviadas:\n`);
    for (const o of enviaveis.slice(0, 15)) {
      console.log(
        `    OS ${o.numero.padEnd(8)} ${(o.cliente ?? "").slice(0, 28).padEnd(30)} -> "${logins.get(o.tecnicoId!)!.login}"`,
      );
    }
    if (enviaveis.length > 15) console.log(`    ... e mais ${enviaveis.length - 15}`);
    console.log(
      `\n  Nada foi enviado. Repita com --aplicar para valer.\n` +
        `  Estimativa: ~${Math.ceil((enviaveis.length * intervalo) / 60)} min com ${intervalo}s entre chamadas.\n`,
    );
    return;
  }

  let ok = 0;
  const falhas: string[] = [];

  for (const [i, ordem] of enviaveis.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, intervalo * 1000));

    const login = logins.get(ordem.tecnicoId!)!.login!;
    try {
      const r = await gravarResponsavelNoSgp(ordem, login);
      if (r.ok) {
        ok += 1;
        console.log(`  ✓ OS ${ordem.numero.padEnd(8)} -> ${login}`);
      } else {
        falhas.push(`OS ${ordem.numero}: ${r.motivo} ${r.resposta ?? ""}`);
        console.log(`  ✗ OS ${ordem.numero.padEnd(8)} ${r.motivo}`);
      }
    } catch (erro) {
      falhas.push(`OS ${ordem.numero}: ${erro instanceof Error ? erro.message : "erro"}`);
      console.log(`  ✗ OS ${ordem.numero.padEnd(8)} erro de rede`);
    }
  }

  console.log(`\n  ─────────────────────────────\n  ${ok} atualizada(s) no SGP`);
  if (falhas.length) {
    console.log(`  ${falhas.length} falha(s):`);
    for (const f of falhas.slice(0, 10)) console.log(`    ${f}`);
    console.log(
      `\n  "Técnico não localizado" quer dizer que o login está errado.\n` +
        `  Corrija em Configurações → Distribuição automática e rode de novo.\n`,
    );
  } else {
    console.log("");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
