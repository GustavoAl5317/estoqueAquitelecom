/**
 * Sincroniza ordens de serviço do SGP.
 *
 *   npm run sgp:sync                          contratos já conhecidos aqui
 *   npm run sgp:sync -- --contratos 2505,3808 contratos específicos
 *   npm run sgp:sync -- --de 2500 --ate 2600  varre uma faixa
 *   npm run sgp:sync -- --intervalo 6000      espaça as chamadas
 *
 * A varredura por faixa existe porque o SGP não expõe listagem de contratos:
 * a única forma de descobrir o que existe é perguntar um a um. Use com
 * parcimônia — são 4 segundos por contrato para não levar 403 por excesso de
 * requisições.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  contratosConhecidos,
  marcarSincronizacao,
  sincronizarContratos,
} from "../src/lib/servicos/sgp";

const argv = process.argv.slice(2);
const valor = (nome: string) => {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function main() {
  const lista = valor("contratos");
  const de = Number(valor("de"));
  const ate = Number(valor("ate"));
  const intervalo = Number(valor("intervalo")) || 4000;

  let contratos: number[];

  if (lista) {
    contratos = lista
      .split(",")
      .map((n) => Number(n.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
  } else if (Number.isInteger(de) && Number.isInteger(ate) && ate >= de) {
    contratos = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  } else {
    contratos = await contratosConhecidos();
    if (!contratos.length) {
      console.log(`
  Nenhum contrato conhecido ainda.

  O SGP não expõe listagem de contratos, então a base cresce pelo uso. Informe
  os contratos na primeira vez:

    npm run sgp:sync -- --contratos 2505,3808
    npm run sgp:sync -- --de 2500 --ate 2600
`);
      return;
    }
  }

  const minutos = Math.ceil((contratos.length * intervalo) / 60_000);
  console.log(
    `\n  ${contratos.length} contrato(s) · ${intervalo / 1000}s entre chamadas · ~${minutos} min\n`,
  );

  const inicio = Date.now();
  const r = await sincronizarContratos(contratos, { intervaloMs: intervalo });
  await marcarSincronizacao(r);

  console.log(`
  ─────────────────────────────────────────────
  ${r.contratosConsultados} contrato(s) consultado(s) em ${Math.round((Date.now() - inicio) / 1000)}s
  ${r.chamadosRecebidos} chamado(s) recebido(s)
  ${r.semOrdemDeServico} sem OS (ignorados — não viraram trabalho de campo)

  ${r.criadas} ordem(ns) criada(s)
  ${r.atualizadas} atualizada(s)
  ${r.semCoordenada} sem coordenada
`);

  for (const erro of r.erros) console.log(`  x ${erro}`);
  console.log("");
}

main()
  .catch((erro) => {
    console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
