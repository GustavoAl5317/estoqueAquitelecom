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
  listarContrato,
  osIdDoIdSgp,
} from "@/lib/servicos/sgp-notificacao";

const argv = process.argv.slice(2);

/**
 * Junta tudo até a próxima opção.
 *
 * `npm run ... -- --tecnico "Igor Silva"` chega aqui como dois argumentos: o
 * npm come as aspas no caminho. Ler só o primeiro gravaria "Igor" no SGP do
 * cliente — erro silencioso, do tipo que só aparece quando alguém abre a OS
 * lá e vê um nome pela metade.
 */
function opcao(nome: string) {
  const i = argv.indexOf(`--${nome}`);
  if (i < 0) return undefined;
  const partes: string[] = [];
  for (let j = i + 1; j < argv.length && !argv[j].startsWith("--"); j += 1) {
    partes.push(argv[j]);
  }
  return partes.length ? partes.join(" ") : undefined;
}

const alvo = opcao("os");
const tecnico = opcao("tecnico");
const aplicar = argv.includes("--aplicar");
const contratoBruto = opcao("contrato");

/**
 * Despeja o que o SGP devolve para um contrato.
 *
 * Existe porque a OS que a gente tem gravada pode não estar mais viva lá: o
 * contrato 5388 devolveu sete chamados, todos com `os_id` vazio, o que quer
 * dizer que aquela ordem já não vem mais na listagem. Para provar a escrita
 * é preciso mirar numa OS que o SGP ainda devolve — e é isto que acha uma.
 */
/** a linha crua daquela OS, com todos os campos que o SGP mandar */
async function lerOsCrua(contrato: string, osId: string) {
  const { linhas } = await listarContrato(contrato);
  return (
    (linhas as unknown as Record<string, unknown>[]).find(
      (l) => String(l.os_id ?? "") === osId,
    ) ?? null
  );
}

async function despejarContrato(contrato: string) {
  const { linhas, erro } = await listarContrato(contrato);
  if (erro) {
    console.error(`\n  ${erro}\n`);
    process.exit(1);
  }

  console.log(`\n  contrato ${contrato} — ${linhas.length} chamado(s)\n`);
  for (const l of linhas) {
    const osId = String(l.os_id ?? "");
    console.log(
      `  os_id ${(osId || "—").padEnd(8)} ${String(l.oc_protocolo ?? "").padEnd(14)} ` +
        `${String(l.os_status_descricao ?? l.oc_status_descricao ?? "").padEnd(22)} ` +
        `resp: "${String(l.os_tecnico_responsavel ?? "")}"`,
    );
  }
  const vivas = linhas.filter((l) => String(l.os_id ?? ""));
  console.log(
    `\n  ${vivas.length} com OS viva. ${
      vivas.length
        ? `Teste em: --os ${String(vivas[0].os_id)}`
        : "Nenhuma serve para o teste de escrita."
    }\n`,
  );
}

/**
 * Varre os contratos das OS mais recentes até achar uma que o SGP ainda
 * devolva com `os_id`.
 *
 * O contrato 5388 mostrou que nem toda OS que temos gravada continua viva na
 * listagem de lá. Procurar na mão, um contrato por vez, é o tipo de trabalho
 * que a máquina faz melhor — respeitando os 4 segundos entre chamadas, porque
 * o 403 deste SGP é limite de requisição.
 */
async function procurarOsViva(limite: number) {
  const recentes = await prisma.ordemServico.findMany({
    where: { origem: "SGP", contrato: { not: null } },
    select: { numero: true, contrato: true, cliente: true },
    orderBy: { abertaEm: "desc" },
    take: 200,
  });

  const contratos = [...new Set(recentes.map((o) => o.contrato!))].slice(0, limite);
  console.log(`\n  procurando OS viva em ${contratos.length} contrato(s)...\n`);

  for (const [i, contrato] of contratos.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 4000));

    const { linhas, erro } = await listarContrato(contrato);
    if (erro) {
      console.log(`  ${contrato.padEnd(8)} ${erro.slice(0, 70)}`);
      continue;
    }

    const vivas = linhas.filter((l) => String(l.os_id ?? ""));
    console.log(
      `  ${contrato.padEnd(8)} ${String(linhas.length).padStart(3)} chamado(s), ${vivas.length} com OS`,
    );

    if (vivas.length) {
      const alvoViva = vivas[0];
      console.log(
        `\n  ✓ achei: os_id ${alvoViva.os_id} · responsável hoje: "${alvoViva.os_tecnico_responsavel ?? ""}"\n` +
          `\n  Teste a escrita com:\n` +
          `    npm run sgp:tecnico -- --os ${alvoViva.os_id} --tecnico "Igor Silva"\n`,
      );
      return;
    }
  }

  console.log(
    `\n  Nenhuma OS viva nos contratos consultados. Aumente com --procurar 20.\n`,
  );
}

async function main() {
  if (contratoBruto) {
    await despejarContrato(contratoBruto);
    return;
  }

  if (argv.includes("--procurar")) {
    await procurarOsViva(Number(opcao("procurar")) || 8);
    return;
  }

  if (!alvo || !tecnico) {
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

  /**
   * A OS que veio do SGP é gravada aqui com o `os_id` cru — "31375" — enquanto
   * o `idSgp` fica "OS-31375". As criadas aqui usam "OS-2026-0060". Os três
   * formatos se parecem o suficiente para alguém errar, então aceitamos
   * qualquer um em vez de exigir que se acerte de primeira.
   */
  const ordem = await prisma.ordemServico.findFirst({
    where: {
      OR: [
        { numero: alvo },
        { idSgp: alvo },
        { idSgp: `OS-${alvo}` },
        { numero: alvo!.replace(/^OS-/i, "") },
      ],
    },
    select: { numero: true, idSgp: true, contrato: true, cliente: true },
  });

  if (!ordem) {
    // o numero da OS do SGP e o idSgp sao parecidos demais para errar sozinho
    const parecidas = await prisma.ordemServico.findMany({
      where: { OR: [{ numero: { contains: alvo } }, { idSgp: { contains: alvo } }] },
      select: { numero: true, idSgp: true, cliente: true },
      take: 5,
    });
    console.error(`\n  OS ${alvo} não encontrada nesta base.`);
    if (parecidas.length) {
      console.error("\n  Talvez seja uma destas:");
      for (const p of parecidas) {
        console.error(`    --os ${p.numero}   (idSgp ${p.idSgp ?? "—"})  ${p.cliente ?? ""}`);
      }
    }
    console.error("");
    process.exit(1);
  }

  const osId = osIdDoIdSgp(ordem.idSgp);
  if (!osId || !ordem.contrato) {
    console.error(
      `\n  A OS ${ordem.numero} não veio do SGP (idSgp=${ordem.idSgp ?? "—"}, contrato=${ordem.contrato ?? "—"}).\n`,
    );
    process.exit(1);
  }

  console.log(`\n  OS ${ordem.numero}  ·  cliente ${ordem.cliente ?? "—"}`);
  console.log(`  os_id no SGP: ${osId}  ·  contrato ${ordem.contrato}\n`);

  /**
   * A foto inteira da OS, não só o campo que interessa.
   *
   * Update parcial que apaga o que não foi enviado é comportamento real de
   * algumas APIs, e aqui do lado de cá é indistinguível de sucesso: o campo que
   * a gente queria mudou, e ninguém olha o resto. Numa OS de cliente real isso
   * seria descoberto pelo cliente. Guardar tudo antes é o que permite dizer o
   * que quebrou, e o que restaurar.
   */
  const fotoAntes = await lerOsCrua(ordem.contrato, osId);
  if (!fotoAntes) {
    console.error(`  Não consegui ler a OS ${osId} no contrato ${ordem.contrato}.\n`);
    process.exit(1);
  }

  const antes = {
    responsavel: String(fotoAntes.os_tecnico_responsavel ?? ""),
    status: String(fotoAntes.os_status_descricao ?? ""),
  };
  console.log(`  responsável hoje no SGP: "${antes.responsavel}"  (status: ${antes.status})`);
  console.log(`  campos preenchidos hoje: ${Object.entries(fotoAntes).filter(([, v]) => v !== "" && v !== null).length}`);

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
  const fotoDepois = await lerOsCrua(ordem.contrato, osId);
  if (!fotoDepois) {
    console.error(`\n  Não consegui reler a OS ${osId}. Confira no SGP antes de mexer de novo.\n`);
    process.exit(1);
  }

  const depois = {
    responsavel: String(fotoDepois.os_tecnico_responsavel ?? ""),
    status: String(fotoDepois.os_status_descricao ?? ""),
  };

  // o que mais mudou, incluindo o que possa ter sido apagado
  const chaves = [...new Set([...Object.keys(fotoAntes), ...Object.keys(fotoDepois)])];
  const mudou = chaves.filter(
    (k) => JSON.stringify(fotoAntes[k]) !== JSON.stringify(fotoDepois[k]),
  );

  console.log(`\n  responsável agora no SGP: "${depois.responsavel}"  (status: ${depois.status})`);
  console.log(`\n  campos que mudaram: ${mudou.length ? mudou.join(", ") : "nenhum"}`);
  for (const k of mudou) {
    console.log(`    ${k}: ${JSON.stringify(fotoAntes[k])} → ${JSON.stringify(fotoDepois[k])}`);
  }

  const apagados = mudou.filter(
    (k) =>
      fotoAntes[k] !== "" &&
      fotoAntes[k] !== null &&
      (fotoDepois[k] === "" || fotoDepois[k] === null),
  );
  if (apagados.length) {
    console.error(
      `\n  PERIGO: o update APAGOU ${apagados.join(", ")}.\n` +
        `  Restaure isso no SGP e não ligue a escrita automática.\n`,
    );
  }

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
