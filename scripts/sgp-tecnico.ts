/**
 * Descobre se o SGP aceita gravar o técnico responsável de uma OS.
 *
 * A documentação pública não lista esse campo na rota de atualização, mas o SGP
 * o devolve na leitura. Omissão de documentação e limitação real são
 * indistinguíveis daqui — só o teste decide, e o teste tem que se provar
 * sozinho: grava, relê a OS e compara.
 *
 * Roda em seco por padrão. `--aplicar` é o que toca na produção do cliente, e
 * deve ser usado primeiro numa OS de teste.
 *
 * Uso:
 *   npm run sgp:tecnico -- --os OS-2026-0001 --tecnico "Igor Silva"
 *   npm run sgp:tecnico -- --os OS-2026-0001 --tecnico "Igor Silva" --aplicar
 */
import "dotenv/config";
import { prisma } from "@/lib/prisma";
import {
  gravarResponsavelNoSgp,
  osIdDoIdSgp,
  responsavelNoSgp,
} from "@/lib/servicos/sgp-notificacao";

const argv = process.argv.slice(2);
function opcao(nome: string) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
}

const numero = opcao("os");
const tecnico = opcao("tecnico");
const aplicar = argv.includes("--aplicar");

async function main() {
  if (!numero || !tecnico) {
    console.error(`
  Informe a OS e o nome do técnico.

    npm run sgp:tecnico -- --os OS-2026-0001 --tecnico "Igor Silva"

  Opções:
    --os       número da OS aqui no sistema (obrigatório)
    --tecnico  nome a gravar no SGP (obrigatório)
    --aplicar  envia de verdade. Sem isso, só mostra o que seria enviado.
`);
    process.exit(1);
  }

  const ordem = await prisma.ordemServico.findUnique({
    where: { numero },
    select: { numero: true, idSgp: true, contrato: true, cliente: true },
  });

  if (!ordem) {
    console.error(`\n  OS ${numero} não encontrada nesta base.\n`);
    process.exit(1);
  }

  const osId = osIdDoIdSgp(ordem.idSgp);
  if (!osId || !ordem.contrato) {
    console.error(
      `\n  A OS ${numero} não veio do SGP (idSgp=${ordem.idSgp ?? "—"}, contrato=${ordem.contrato ?? "—"}).\n`,
    );
    process.exit(1);
  }

  console.log(`\n  OS ${ordem.numero}  ·  cliente ${ordem.cliente ?? "—"}`);
  console.log(`  os_id no SGP: ${osId}  ·  contrato ${ordem.contrato}\n`);

  const antes = await responsavelNoSgp(ordem.contrato, osId);
  if ("erro" in antes) {
    console.error(`  Não consegui ler a OS no SGP: ${antes.erro}\n`);
    process.exit(1);
  }
  console.log(`  responsável hoje no SGP: "${antes.responsavel}"  (status: ${antes.status})`);

  const envio = await gravarResponsavelNoSgp(ordem, tecnico, { simular: !aplicar });

  console.log(`\n  ${aplicar ? "ENVIANDO" : "SIMULAÇÃO"}`);
  console.log(`  POST ${envio.url}`);
  console.log(`  form-data: app=***  token=***  ${Object.entries(envio.corpo)
    .map(([k, v]) => `${k}="${v}"`)
    .join("  ")}`);

  if (!aplicar) {
    console.log(`\n  Nada foi enviado. Repita com --aplicar para valer.\n`);
    return;
  }

  console.log(`  resposta: HTTP ${envio.httpStatus} ${envio.resposta ?? ""}`);

  // a prova: o SGP pode responder 200 e ignorar o campo em silêncio
  const depois = await responsavelNoSgp(ordem.contrato, osId);
  if ("erro" in depois) {
    console.error(`\n  Não consegui reler a OS: ${depois.erro}\n`);
    process.exit(1);
  }

  console.log(`\n  responsável agora no SGP: "${depois.responsavel}"  (status: ${depois.status})`);

  if (depois.responsavel === tecnico) {
    console.log(`\n  ✓ FUNCIONA. O SGP aceita os_tecnico_responsavel na rota de update.\n`);
  } else if (depois.responsavel !== antes.responsavel) {
    console.log(`\n  ~ Mudou, mas para algo diferente do enviado. Vale investigar antes de ligar.\n`);
  } else {
    console.log(
      `\n  ✗ NÃO PEGOU. O campo foi ignorado — a rota aceita o POST e descarta\n` +
        `    os_tecnico_responsavel. Não dá para fazer do jeito pedido sem a TSMX.\n`,
    );
  }

  if (depois.status !== antes.status) {
    console.error(
      `\n  ATENÇÃO: o status da OS mudou de "${antes.status}" para "${depois.status}".\n` +
        `  Isso não era esperado — confira essa OS no SGP.\n`,
    );
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
