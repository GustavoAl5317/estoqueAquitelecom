/**
 * Coletor de posições do Traccar.
 *
 *   npm run traccar -- --verificar          testa a credencial e lista o resumo
 *   npm run traccar -- --dispositivos       mostra os aparelhos da conta
 *   npm run traccar -- --importar           cadastra os aparelhos que faltam
 *   npm run traccar -- --sincronizar        puxa as posições atuais uma vez
 *   npm run traccar -- --loop 60            fica sincronizando a cada 60 s
 *
 * Importar NÃO classifica: o aparelho entra como "não classificado" e alguém
 * diz na Central de Controle se é carro, celular de técnico ou equipamento.
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  importarDispositivos,
  listarDispositivos,
  sincronizarPosicoes,
  verificarConexao,
} from "../src/lib/servicos/traccar";
import { TIPO_RASTREADOR } from "../src/lib/dominio";

const argv = process.argv.slice(2);
const tem = (bandeira: string) => argv.includes(`--${bandeira}`);
const valor = (bandeira: string) => {
  const i = argv.indexOf(`--${bandeira}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const hora = () => new Date().toLocaleTimeString("pt-BR");

async function verificar() {
  const info = await verificarConexao();
  console.log(`\n  Traccar ${info.versao}`);
  console.log(`  ${info.dispositivos} aparelho(s) na conta`);
  console.log(`  ${info.online} online agora\n`);
}

async function dispositivos() {
  const lista = await listarDispositivos();
  const conhecidos = new Map(
    (await prisma.rastreador.findMany()).map((r) => [r.identificador, r.tipo]),
  );

  console.log(`\n  ${lista.length} aparelho(s):\n`);
  console.log(
    `  ${"uniqueId".padEnd(20)} ${"nome".padEnd(26)} ${"status".padEnd(9)} aqui`,
  );
  console.log(`  ${"-".repeat(78)}`);

  for (const d of lista) {
    const tipo = conhecidos.get(d.uniqueId);
    console.log(
      `  ${d.uniqueId.padEnd(20)} ${d.name.slice(0, 25).padEnd(26)} ${d.status.padEnd(9)} ${
        tipo ? TIPO_RASTREADOR.rotulo(tipo) : "NÃO IMPORTADO"
      }`,
    );
  }

  const pendentes = [...conhecidos.values()].filter(
    (t) => t === "NAO_CLASSIFICADO",
  ).length;

  console.log(
    `\n  Use --importar para trazer os que faltam.` +
      (pendentes
        ? `\n  ${pendentes} aparelho(s) importado(s) ainda sem classificação — resolva em /central.`
        : ""),
    "\n",
  );
}

async function importar() {
  const r = await importarDispositivos();
  console.log(`\n  ${r.total} aparelho(s) na conta · ${r.criados.length} novo(s) aqui`);
  for (const criado of r.criados) console.log(`      + ${criado}`);
  if (r.pendentes) {
    console.log(
      `\n  ${r.pendentes} aparelho(s) aguardando classificação.` +
        `\n  Abra /central e diga o que é cada um — carro, celular de técnico ou equipamento.`,
    );
  }
  console.log("");
}

async function sincronizar(importarNovos: boolean) {
  const r = await sincronizarPosicoes({ importarNovos });

  console.log(
    `  [${hora()}] ${r.posicoesGravadas} nova(s) de ${r.posicoesRecebidas} posição(ões) · ${r.dispositivos} aparelho(s)`,
  );

  for (const criado of r.rastreadoresCriados) {
    console.log(`      + aparelho importado: ${criado}`);
  }
  if (r.naoClassificados.length) {
    console.log(
      `      ! ${r.naoClassificados.length} sem classificação: ${r.naoClassificados
        .slice(0, 5)
        .map((s) => `${s.nome} (${s.identificador})`)
        .join(", ")}`,
    );
  }
  for (const erro of r.erros) console.log(`      x ${erro}`);

  return r;
}

async function main() {
  if (tem("verificar")) return verificar();
  if (tem("dispositivos")) return dispositivos();
  if (tem("importar") && !tem("loop") && !tem("sincronizar")) return importar();

  if (tem("loop")) {
    const segundos = Math.max(15, Number(valor("loop")) || 60);
    console.log(`\n  Sincronizando a cada ${segundos}s. Ctrl+C para parar.\n`);
    // primeira rodada imediata, depois no intervalo
    await sincronizar(tem("importar")).catch((e) =>
      console.error("  erro:", e.message),
    );
    setInterval(() => {
      sincronizar(false).catch((e) => console.error("  erro:", e.message));
    }, segundos * 1000);
    return new Promise(() => {}); // mantém o processo vivo
  }

  if (tem("sincronizar")) {
    await sincronizar(false);
    return;
  }

  console.log(`
  Coletor de posições do Traccar

    npm run traccar -- --verificar        testa a credencial
    npm run traccar -- --dispositivos     lista os aparelhos da conta
    npm run traccar -- --importar         cadastra os aparelhos que faltam
    npm run traccar -- --sincronizar      puxa as posições uma vez
    npm run traccar -- --loop 60          sincroniza a cada 60 segundos
`);
}

main()
  .catch((erro) => {
    console.error(`\n  ${erro instanceof Error ? erro.message : erro}\n`);
    process.exit(1);
  })
  .finally(() => {
    if (!tem("loop")) prisma.$disconnect();
  });
