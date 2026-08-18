import {
  PRIORIDADE_OS,
  SEVERIDADE_OS,
  STATUS_OS,
  STATUS_OS_ABERTOS,
  TIPO_OS,
} from "@/lib/dominio";
import { prisma } from "@/lib/prisma";
import { normalizar } from "@/lib/utils";

/**
 * 2.48 — BUSCA EM LINGUAGEM NATURAL.
 *
 * Não é um modelo de linguagem: é um tradutor de expressões para filtros. A
 * escolha é deliberada. Um supervisor perguntando "OS críticas de sem conexão
 * abertas hoje" precisa de uma resposta correta e instantânea, não de uma
 * resposta plausível — e precisa ver **quais filtros** foram aplicados, para
 * confiar no resultado ou corrigi-lo.
 *
 * Por isso a função devolve os filtros interpretados junto com a query: a tela
 * mostra "entendi assim" e deixa ajustar. Uma interpretação errada que se vê é
 * um clique de distância do certo; uma que não se vê vira decisão errada.
 */

export type Interpretacao = {
  /** o que a busca entendeu, em pares legíveis */
  entendido: { campo: string; valor: string }[];
  /** o que sobrou e virou busca textual */
  termoLivre: string | null;
  /** a query string equivalente, para a tela de OS */
  query: string;
};

type Regra = {
  campo: string;
  rotulo: string;
  valor: string;
  /** expressões que disparam a regra, já normalizadas */
  gatilhos: string[];
};

function regrasDeDominio(): Regra[] {
  const regras: Regra[] = [];

  for (const opcao of TIPO_OS.opcoes) {
    regras.push({
      campo: "tipo",
      rotulo: "Tipo",
      valor: opcao.valor,
      gatilhos: [normalizar(opcao.rotulo)],
    });
  }

  for (const opcao of STATUS_OS.opcoes) {
    regras.push({
      campo: "status",
      rotulo: "Situação",
      valor: opcao.valor,
      gatilhos: [normalizar(opcao.rotulo)],
    });
  }

  for (const opcao of PRIORIDADE_OS.opcoes) {
    regras.push({
      campo: "prioridade",
      rotulo: "Prioridade",
      valor: opcao.valor,
      gatilhos: [normalizar(opcao.valor)],
    });
  }

  for (const opcao of SEVERIDADE_OS.opcoes) {
    regras.push({
      campo: "severidade",
      rotulo: "Severidade",
      valor: opcao.valor,
      gatilhos: [normalizar(opcao.rotulo)],
    });
  }

  return regras;
}

/** expressões do jargão da operação que não são valores de domínio */
const EXPRESSOES: Regra[] = [
  {
    campo: "risco",
    rotulo: "Prazo",
    valor: "1",
    gatilhos: [
      "atrasada",
      "atrasadas",
      "estourada",
      "estouradas",
      "vencida",
      "vencidas",
      "em risco",
      "perto do sla",
      "estourando",
    ],
  },
  {
    campo: "semResponsavel",
    rotulo: "Responsável",
    valor: "1",
    gatilhos: [
      "sem tecnico",
      "sem responsavel",
      "nao atribuida",
      "nao atribuidas",
      "sem dono",
    ],
  },
  {
    campo: "status",
    rotulo: "Situação",
    valor: STATUS_OS_ABERTOS.join(","),
    gatilhos: ["abertas", "aberta", "em aberto", "pendentes"],
  },
  {
    campo: "periodo",
    rotulo: "Período",
    valor: "hoje",
    gatilhos: ["hoje", "de hoje"],
  },
  {
    campo: "periodo",
    rotulo: "Período",
    valor: "7",
    gatilhos: ["esta semana", "essa semana", "ultimos 7 dias", "na semana"],
  },
  {
    campo: "periodo",
    rotulo: "Período",
    valor: "30",
    gatilhos: ["este mes", "esse mes", "ultimos 30 dias", "no mes"],
  },
];

/**
 * Interpreta a pergunta. Bairros e técnicos entram na busca porque são nomes
 * próprios que só existem nesta instalação — não daria para deixá-los numa
 * tabela fixa.
 */
export async function interpretar(pergunta: string): Promise<Interpretacao> {
  const original = pergunta.trim();
  let restante = ` ${normalizar(original)} `;

  const entendido: { campo: string; valor: string; rotulo: string }[] = [];

  const consumir = (regra: Regra) => {
    for (const gatilho of regra.gatilhos) {
      if (!gatilho) continue;
      const alvo = ` ${gatilho} `;
      if (restante.includes(alvo)) {
        restante = restante.replace(alvo, " ");
        entendido.push({
          campo: regra.campo,
          valor: regra.valor,
          rotulo: regra.rotulo,
        });
        return true;
      }
    }
    return false;
  };

  // as expressões primeiro: "sem conexão" não deve virar o tipo "conexão"
  for (const regra of EXPRESSOES) consumir(regra);

  // as mais longas antes, para "mudança de endereço" ganhar de "endereço"
  const dominio = regrasDeDominio().sort(
    (a, b) => (b.gatilhos[0]?.length ?? 0) - (a.gatilhos[0]?.length ?? 0),
  );
  for (const regra of dominio) consumir(regra);

  const [bairros, tecnicos] = await Promise.all([
    prisma.bairro.findMany({ select: { id: true, nome: true } }),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
    }),
  ]);

  for (const bairro of bairros) {
    consumir({
      campo: "bairroId",
      rotulo: "Bairro",
      valor: bairro.id,
      gatilhos: [normalizar(bairro.nome)],
    });
  }

  for (const tecnico of tecnicos) {
    // o primeiro nome basta: ninguém digita o nome completo
    const partes = normalizar(tecnico.nome).split(" ");
    consumir({
      campo: "tecnicoId",
      rotulo: "Técnico",
      valor: tecnico.id,
      gatilhos: [normalizar(tecnico.nome), partes[0]],
    });
  }

  // o que sobrou, tirando palavras de ligação, vira busca textual
  const RUIDO = new Set([
    "os",
    "as",
    "a",
    "o",
    "de",
    "da",
    "do",
    "das",
    "dos",
    "em",
    "no",
    "na",
    "com",
    "que",
    "e",
    "mostre",
    "mostrar",
    "listar",
    "liste",
    "quais",
    "quantas",
    "quantos",
    "me",
    "todas",
    "todos",
    "ordens",
    "ordem",
    "servico",
    "tecnico",
    "tecnicos",
    "bairro",
    "bairros",
    "estao",
    "esta",
  ]);

  const sobra = restante
    .split(/\s+/)
    .filter((palavra) => palavra && !RUIDO.has(palavra))
    .join(" ")
    .trim();

  const parametros = new URLSearchParams();
  for (const item of entendido) {
    if (!parametros.has(item.campo)) parametros.set(item.campo, item.valor);
  }
  if (sobra) parametros.set("q", sobra);

  return {
    entendido: entendido.map((item) => ({
      campo: item.rotulo,
      valor: rotularValor(item.campo, item.valor),
    })),
    termoLivre: sobra || null,
    query: parametros.toString(),
  };
}

function rotularValor(campo: string, valor: string) {
  if (campo === "tipo") return TIPO_OS.rotulo(valor);
  if (campo === "status") {
    return valor.includes(",")
      ? "em aberto"
      : STATUS_OS.rotulo(valor);
  }
  if (campo === "prioridade") return PRIORIDADE_OS.rotulo(valor);
  if (campo === "severidade") return SEVERIDADE_OS.rotulo(valor);
  if (campo === "risco") return "em risco ou estourado";
  if (campo === "semResponsavel") return "sem responsável";
  if (campo === "periodo") {
    return valor === "hoje" ? "hoje" : `últimos ${valor} dias`;
  }
  return valor;
}

/** exemplos mostrados na tela — servem de documentação do que a busca entende */
export const EXEMPLOS_DE_BUSCA = [
  "OS críticas de sem conexão abertas hoje",
  "instalações sem técnico",
  "atrasadas em Messejana",
  "P1 abertas esta semana",
  "reparos do Lucas",
];
