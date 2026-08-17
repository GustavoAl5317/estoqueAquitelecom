/**
 * Coletor de posições do Traccar.
 *
 *   npm run traccar -- --verificar          testa a credencial e lista o resumo
 *   npm run traccar -- --dispositivos       mostra os rastreadores da conta
 *   npm run traccar -- --importar           cadastra os veículos que faltam
 *   npm run traccar -- --sincronizar        puxa as posições atuais uma vez
 *   npm run traccar -- --loop 60            fica sincronizando a cada 60 s
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  listarDispositivos,
  sincronizarPosicoes,
  verificarConexao,
} from "../src/lib/servicos/traccar";

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
  console.log(`  ${info.dispositivos} rastreador(es) na conta`);
  console.log(`  ${info.online} online agora\n`);
}

async function dispositivos() {
  const lista = await listarDispositivos();
  const veiculos = await prisma.veiculo.findMany({
    select: { placa: true, rastreador: true },
  });
  const conhecidos = new Set(veiculos.map((v) => v.rastreador).filter(Boolean));

  console.log(`\n  ${lista.length} dispositivo(s):\n`);
  console.log(
    `  ${"uniqueId".padEnd(20)} ${"nome".padEnd(26)} ${"status".padEnd(9)} vinculado`,
  );
  console.log(`  ${"-".repeat(74)}`);
  for (const d of lista) {
    console.log(
      `  ${d.uniqueId.padEnd(20)} ${d.name.slice(0, 25).padEnd(26)} ${d.status.padEnd(9)} ${
        conhecidos.has(d.uniqueId) ? "sim" : "NÃO"
      }`,
    );
  }
  console.log(
    `\n  Os marcados com NÃO ainda não têm veículo aqui. Use --importar para cadastrar.\n`,
  );
}

async function sincronizar(criarVeiculos: boolean) {
  const r = await sincronizarPosicoes({ criarVeiculos });

  console.log(
    `  [${hora()}] ${r.posicoesGravadas} nova(s) de ${r.posicoesRecebidas} posição(ões) · ${r.dispositivos} dispositivo(s)`,
  );

  for (const criado of r.veiculosCriados) {
    console.log(`      + veículo cadastrado: ${criado}`);
  }
  if (r.semVinculo.length) {
    console.log(
      `      ! ${r.semVinculo.length} sem veículo aqui: ${r.semVinculo
        .slice(0, 5)
        .map((s) => `${s.nome} (${s.uniqueId})`)
        .join(", ")}`,
    );
  }
  for (const erro of r.erros) console.log(`      x ${erro}`);

  return r;
}

async function main() {
  if (tem("verificar")) return verificar();
  if (tem("dispositivos")) return dispositivos();

  if (tem("loop")) {
    const segundos = Math.max(15, Number(valor("loop")) || 60);
    console.log(
      `\n  Sincronizando a cada ${segundos}s. Ctrl+C para parar.\n`,
    );
    // primeira rodada imediata, depois no intervalo
    await sincronizar(tem("importar")).catch((e) => console.error("  erro:", e.message));
    setInterval(() => {
      sincronizar(false).catch((e) => console.error("  erro:", e.message));
    }, segundos * 1000);
    return new Promise(() => {}); // mantém o processo vivo
  }

  if (tem("importar") || tem("sincronizar")) {
    await sincronizar(tem("importar"));
    return;
  }

  console.log(`
  Coletor de posições do Traccar

    npm run traccar -- --verificar        testa a credencial
    npm run traccar -- --dispositivos     lista os rastreadores da conta
    npm run traccar -- --importar         cadastra os veículos que faltam
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
