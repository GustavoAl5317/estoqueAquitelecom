import { prisma } from "@/lib/prisma";
import { normalizar } from "@/lib/utils";
import { STATUS_OS_ENCERRADOS } from "@/lib/dominio";

/**
 * 2.4 — CASAR O RESPONSÁVEL DO SGP COM O TÉCNICO CADASTRADO.
 *
 * O SGP guarda o responsável como texto digitado por quem abriu a OS. Aqui o
 * técnico é um cadastro. Ligar os dois é o que faz uma OS importada aparecer
 * na tela do técnico certo.
 *
 * O casamento acontece em dois momentos e o segundo é o que importa na
 * prática: a OS quase sempre chega **antes** de o técnico existir no sistema.
 * Por isso o nome do SGP é guardado na OS de qualquer jeito, e quando alguém
 * cadastra o técnico o sistema volta e recolhe as ordens que já eram dele.
 *
 * Nome exato vincula sozinho. Nome parecido **pergunta** — "Lucas Souza" e
 * "Lucas de Souza" provavelmente são a mesma pessoa, mas provavelmente não é
 * o suficiente para reatribuir o trabalho de alguém sem avisar.
 */

/** ignora acento, caixa e espaço repetido */
function chave(nome: string) {
  return normalizar(nome).replace(/\s+/g, " ").trim();
}

/** só as palavras que identificam a pessoa — "de", "da", "dos" não contam */
const LIGACOES = new Set(["de", "da", "do", "das", "dos", "e"]);

function partes(nome: string) {
  return chave(nome)
    .split(" ")
    .filter((p) => p && !LIGACOES.has(p));
}

/**
 * Dois nomes que provavelmente são a mesma pessoa, sem serem iguais.
 *
 * O critério é conservador de propósito: primeiro nome igual **e** algum
 * sobrenome em comum. "Lucas Souza" casa com "Lucas de Souza Ferreira";
 * "Lucas Souza" não casa com "Lucas Andrade", que é outra pessoa.
 */
export function pareceMesmaPessoa(a: string, b: string) {
  const pa = partes(a);
  const pb = partes(b);
  if (!pa.length || !pb.length) return false;
  if (chave(a) === chave(b)) return false; // igual não é "parecido"
  if (pa[0] !== pb[0]) return false;

  const restoA = new Set(pa.slice(1));
  return pb.slice(1).some((p) => restoA.has(p));
}

export type OrdensDoNome = {
  nome: string;
  abertas: number;
  total: number;
};

/**
 * Os nomes de responsável que vieram do SGP e ainda não têm técnico cadastrado.
 *
 * É o que alimenta tanto o vínculo automático quanto a pergunta de nome
 * parecido na hora do cadastro.
 */
export async function responsaveisSemCadastro(): Promise<OrdensDoNome[]> {
  const ordens = await prisma.ordemServico.findMany({
    where: { tecnicoId: null, tecnicoSgpNome: { not: null } },
    select: { tecnicoSgpNome: true, status: true },
  });

  const porNome = new Map<string, OrdensDoNome>();
  for (const ordem of ordens) {
    const nome = ordem.tecnicoSgpNome!;
    const atual = porNome.get(chave(nome)) ?? { nome, abertas: 0, total: 0 };
    atual.total += 1;
    if (!STATUS_OS_ENCERRADOS.includes(ordem.status)) atual.abertas += 1;
    porNome.set(chave(nome), atual);
  }

  return [...porNome.values()].sort((a, b) => b.abertas - a.abertas);
}

export type SugestaoDeVinculo = {
  /** o nome como está gravado nas OS do SGP */
  nome: string;
  abertas: number;
  total: number;
};

/**
 * O que fazer com um técnico que acabou de ser cadastrado com este nome.
 *
 * `exato` já pode ser vinculado sem perguntar. `parecidos` viram uma pergunta
 * na tela, porque reatribuir OS por semelhança de nome é decisão de gente.
 */
export async function sugerirVinculo(nomeDoTecnico: string) {
  const candidatos = await responsaveisSemCadastro();

  const exato = candidatos.find((c) => chave(c.nome) === chave(nomeDoTecnico));
  const parecidos = candidatos.filter((c) =>
    pareceMesmaPessoa(nomeDoTecnico, c.nome),
  );

  return { exato: exato ?? null, parecidos };
}

/**
 * Amarra as OS daquele nome ao técnico.
 *
 * Só toca em OS sem responsável: se alguém já atribuiu na mão, essa decisão
 * vale mais que o texto que veio do SGP. OS aberta e sem responsável passa a
 * "atribuída", que é o que o próprio domínio exige de uma OS com técnico.
 */
export async function vincularOrdensDoNome(tecnicoId: string, nome: string) {
  const alvo = chave(nome);

  const candidatas = await prisma.ordemServico.findMany({
    where: { tecnicoId: null, tecnicoSgpNome: { not: null } },
    select: { id: true, tecnicoSgpNome: true, status: true },
  });

  const ids = candidatas
    .filter((o) => chave(o.tecnicoSgpNome!) === alvo)
    .map((o) => o.id);

  if (!ids.length) return { vinculadas: 0 };

  await prisma.ordemServico.updateMany({
    where: { id: { in: ids } },
    data: { tecnicoId },
  });

  // OS com responsável não fica em "aberta" — o domínio já trata isso como incoerente
  await prisma.ordemServico.updateMany({
    where: { id: { in: ids }, status: "ABERTA" },
    data: { status: "ATRIBUIDA" },
  });

  return { vinculadas: ids.length };
}
