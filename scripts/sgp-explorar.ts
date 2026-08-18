/**
 * Sonda da API do SGP.
 *
 * Descobre sozinho o que a instância do cliente devolve de verdade: quais
 * campos existem, quais tipos de OS estão cadastrados e quais status uma OS
 * pode ter. É o insumo do mapeamento do 2.11 — que não pode sair da
 * documentação do fabricante, porque tipos e status são cadastrados por cada
 * provedor.
 *
 * Nada sai da máquina: a amostra é gravada em arquivo local e o token nunca é
 * impresso na tela.
 *
 * Uso:
 *   npm run sgp -- --path /api/ura/consultacliente/
 *   npm run sgp -- --path /api/ordemservico/listar/ --param limit=200
 *   npm run sgp -- --path /alguma/rota/ --metodo GET
 *   npm run sgp -- --path /api/... --saida amostra-os.json
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// argumentos
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function opcao(nome: string, padrao?: string) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : padrao;
}

function parametros() {
  const extras: Record<string, string> = {};
  argv.forEach((arg, i) => {
    if (arg !== "--param") return;
    const [chave, ...resto] = (argv[i + 1] ?? "").split("=");
    if (chave) extras[chave] = resto.join("=");
  });
  return extras;
}

const rota = opcao("path");
const metodo = (opcao("metodo", "POST") ?? "POST").toUpperCase();
const arquivoSaida = opcao("saida", "sgp-amostra.json")!;
/** envia o corpo como formulário em vez de JSON */
const formulario = argv.includes("--form");

if (!rota) {
  console.error(`
Informe a rota a consultar.

  npm run sgp -- --path /api/ordemservico/listar/

Opções:
  --path    rota da API (obrigatório)
  --metodo  POST (padrão) ou GET
  --param   parâmetro extra, repetível:  --param limit=100 --param status=A
  --saida   nome do arquivo de amostra   (padrão: sgp-amostra.json)
`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// credenciais
// ---------------------------------------------------------------------------

const base = (process.env.SGP_BASE_URL ?? process.env.SGP_URL ?? "").replace(
  /\/+$/,
  "",
);
const app = process.env.SGP_APP ?? "";
const token = process.env.SGP_TOKEN ?? "";
const usuario = process.env.SGP_USUARIO ?? "";
const senha = process.env.SGP_SENHA ?? "";

if (!base) {
  console.error(
    "SGP_BASE_URL não está definida no .env. Copie o .env.example e preencha.",
  );
  process.exit(1);
}
if (!token && !senha) {
  console.error("Defina SGP_TOKEN (ou SGP_USUARIO/SGP_SENHA) no .env.");
  process.exit(1);
}

const credenciais: Record<string, string> = {};
if (app) credenciais.app = app;
if (token) credenciais.token = token;
if (usuario) credenciais.usuario = usuario;
if (senha) credenciais.senha = senha;

// ---------------------------------------------------------------------------
// chamada
// ---------------------------------------------------------------------------

async function consultar() {
  const corpo = { ...credenciais, ...parametros() };
  const url = new URL(base + (rota!.startsWith("/") ? rota : `/${rota}`));

  console.log(`\n→ ${metodo} ${url.origin}${url.pathname}`);
  console.log(
    `  credenciais: ${Object.keys(credenciais).join(", ")} (valores ocultos)`,
  );
  const extras = parametros();
  if (Object.keys(extras).length) {
    console.log(`  parâmetros: ${JSON.stringify(extras)}`);
  }

  const inicio = Date.now();
  let resposta: Response;

  if (metodo === "GET") {
    for (const [chave, valor] of Object.entries(corpo)) {
      url.searchParams.set(chave, valor);
    }
    resposta = await fetch(url, { headers: { Accept: "application/json" } });
  } else if (formulario) {
    /*
     * O SGP documenta form-data. Alguns endpoints aceitam JSON e outros não —
     * e o que não aceita costuma responder 200 com lista vazia em vez de erro,
     * porque simplesmente não enxerga os campos enviados. Um corpo mudo parece
     * "sem resultado", o que manda a investigação para o lado errado.
     */
    resposta = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(corpo).toString(),
    });
  } else {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(corpo),
    });
  }

  const duracao = Date.now() - inicio;
  const bruto = await resposta.text();

  console.log(
    `← HTTP ${resposta.status} ${resposta.statusText} · ${duracao} ms · ${bruto.length} bytes`,
  );
  console.log(`  content-type: ${resposta.headers.get("content-type") ?? "—"}`);

  if (!resposta.ok) {
    console.log("\nCorpo da resposta (primeiros 800 caracteres):");
    console.log(bruto.slice(0, 800));
    console.log(
      "\nSe o status for 401/403, a credencial ou o nome do parâmetro está diferente.",
    );
    console.log("Se for 404, a rota é outra — confira na documentação.");
    return;
  }

  let dados: unknown;
  try {
    dados = JSON.parse(bruto);
  } catch {
    console.log("\nA resposta não é JSON. Primeiros 800 caracteres:");
    console.log(bruto.slice(0, 800));
    return;
  }

  analisar(dados);

  const destino = path.resolve(process.cwd(), arquivoSaida);
  fs.writeFileSync(destino, JSON.stringify(dados, null, 2));
  console.log(`\nAmostra completa gravada em ${arquivoSaida} (não commite este arquivo).`);
}

// ---------------------------------------------------------------------------
// análise da estrutura
// ---------------------------------------------------------------------------

function analisar(dados: unknown) {
  const registros = extrairLista(dados);

  if (!registros.length) {
    console.log("\nEstrutura devolvida:");
    console.log(descreverFormato(dados));
    return;
  }

  console.log(`\n${registros.length} registro(s) retornado(s).`);

  const campos = new Map<string, Set<string>>();
  for (const registro of registros) {
    if (typeof registro !== "object" || !registro) continue;
    for (const [chave, valor] of Object.entries(registro)) {
      const tipos = campos.get(chave) ?? new Set<string>();
      tipos.add(tipoDe(valor));
      campos.set(chave, tipos);
    }
  }

  console.log("\nCAMPOS DISPONÍVEIS");
  console.log("──────────────────");
  for (const [chave, tipos] of [...campos].sort()) {
    const exemplo = amostraDe(registros, chave);
    console.log(
      `  ${chave.padEnd(30)} ${[...tipos].join("|").padEnd(10)} ${exemplo}`,
    );
  }

  // 2.5 / 2.6 / 2.11 — o que precisa ser mapeado
  const interessantes = [...campos.keys()].filter((chave) =>
    /tipo|status|situacao|situação|estado|prioridade|severidade|setor|servico|serviço/i.test(
      chave,
    ),
  );

  if (interessantes.length) {
    console.log("\nVALORES DISTINTOS NOS CAMPOS DE CLASSIFICAÇÃO");
    console.log("─────────────────────────────────────────────");
    console.log("(é isto que vira a tabela de normalização do item 2.11)\n");

    for (const chave of interessantes) {
      const valores = new Map<string, number>();
      for (const registro of registros) {
        const valor = (registro as Record<string, unknown>)[chave];
        if (valor === null || valor === undefined || valor === "") continue;
        const texto =
          typeof valor === "object" ? JSON.stringify(valor) : String(valor);
        valores.set(texto, (valores.get(texto) ?? 0) + 1);
      }
      if (!valores.size) continue;

      console.log(`  ${chave}`);
      for (const [valor, total] of [...valores].sort((a, b) => b[1] - a[1])) {
        console.log(`      ${String(total).padStart(5)}×  ${valor}`);
      }
      console.log("");
    }
  }

  const geo = [...campos.keys()].filter((c) =>
    /lat|lng|long|coord|endereco|endereço|bairro|cidade|cep/i.test(c),
  );
  console.log(
    geo.length
      ? `\nCampos de localização encontrados: ${geo.join(", ")}`
      : "\nNenhum campo de localização encontrado — o mapa do Bloco 3 vai depender de geocodificação.",
  );

  const prazo = [...campos.keys()].filter((c) =>
    /prazo|sla|vencimento|limite|abertura|conclusao|conclusão|agenda/i.test(c),
  );
  console.log(
    prazo.length
      ? `Campos de data/prazo encontrados: ${prazo.join(", ")}`
      : "Nenhum campo de prazo encontrado — o SLA terá de ser calculado por regra interna.",
  );
}

/** encontra o array de registros, esteja ele na raiz ou aninhado */
function extrairLista(dados: unknown): unknown[] {
  if (Array.isArray(dados)) return dados;
  if (typeof dados !== "object" || !dados) return [];

  for (const valor of Object.values(dados)) {
    if (Array.isArray(valor) && valor.length && typeof valor[0] === "object") {
      return valor;
    }
  }
  // resposta de registro único
  return Object.values(dados).some((v) => typeof v !== "object") ? [dados] : [];
}

function tipoDe(valor: unknown) {
  if (valor === null) return "null";
  if (Array.isArray(valor)) return "lista";
  return typeof valor;
}

/**
 * Campos que carregam dado pessoal de assinante. O exemplo impresso é
 * mascarado: para modelar a integração basta saber que o campo existe e qual o
 * formato, nunca o conteúdo.
 */
const CAMPO_SENSIVEL =
  /nome|cpf|cnpj|email|e-mail|fone|celular|endereco|endereço|logradouro|complemento|numero|documento|rg\b|nascimento|pix|codigobarras|linhadigitavel|link|senha|token|login/i;

function mascarar(texto: string) {
  return texto
    .replace(/[A-Za-zÀ-ÿ]/g, "×")
    .replace(/\d/g, "#")
    .slice(0, 24);
}

function amostraDe(registros: unknown[], chave: string) {
  const sensivel = CAMPO_SENSIVEL.test(chave);
  for (const registro of registros) {
    const valor = (registro as Record<string, unknown>)?.[chave];
    if (valor === null || valor === undefined || valor === "") continue;
    const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor);
    if (sensivel) return `${mascarar(texto)}  (mascarado)`;
    return texto.length > 45 ? `${texto.slice(0, 45)}…` : texto;
  }
  return "(sempre vazio)";
}

function descreverFormato(dados: unknown, nivel = 0): string {
  const recuo = "  ".repeat(nivel + 1);
  if (Array.isArray(dados)) {
    return `lista[${dados.length}]${dados.length ? `\n${recuo}${descreverFormato(dados[0], nivel + 1)}` : ""}`;
  }
  if (typeof dados === "object" && dados) {
    return Object.entries(dados)
      .map(([chave, valor]) => `${recuo}${chave}: ${descreverFormato(valor, nivel + 1)}`)
      .join("\n");
  }
  return `${tipoDe(dados)} = ${JSON.stringify(dados)}`;
}

consultar().catch((erro) => {
  console.error("\nFalha na chamada:", erro instanceof Error ? erro.message : erro);
  console.error(
    "\nSe for erro de certificado, a instância pode estar com HTTPS próprio.",
  );
  process.exit(1);
});
