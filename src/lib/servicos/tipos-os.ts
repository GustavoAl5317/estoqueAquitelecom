import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar } from "./nucleo";
import { normalizar } from "@/lib/utils";
import type { Tom } from "@/lib/dominio";

/**
 * 2.5 — TIPO DE ORDEM DE SERVIÇO, editável pela Central de Configurações.
 *
 * Até aqui, tipo de OS era fixo em `dominio.ts` — o mesmo lugar dos domínios
 * que não podem mudar sem alterar código (status, prioridade). Cliente
 * nenhum consegue renomear "Upgrade de plano" ou parar de ver um tipo que
 * não usa. Este é o único domínio de OS que passa a viver no banco.
 *
 * `valor` nunca muda depois de criado — é o que já está gravado em
 * `OrdemServico.tipo` para toda OS existente. Desativar em vez de apagar
 * preserva o rótulo de quem já tem esse tipo no histórico; só some da lista
 * de opções ao criar OS nova.
 */

export type TipoOSCompleto = {
  id: string;
  valor: string;
  rotulo: string;
  tom: Tom;
  ativo: boolean;
  ordem: number;
};

/** todos, ativos ou não — é o que sustenta rótulo/cor de OS já lançadas */
export async function todosTiposOS(): Promise<TipoOSCompleto[]> {
  const linhas = await prisma.tipoOS.findMany({ orderBy: { ordem: "asc" } });
  return linhas.map((l) => ({ ...l, tom: l.tom as Tom }));
}

/** só os habilitados — é o que preenche o seletor de criar/editar OS */
export async function tiposAtivos(): Promise<TipoOSCompleto[]> {
  return (await todosTiposOS()).filter((t) => t.ativo);
}

/** rótulo de um valor, com o mesmo fallback que TIPO_OS.rotulo tinha: o próprio código */
export function rotuloDoTipo(tipos: TipoOSCompleto[], valor: string) {
  return tipos.find((t) => t.valor === valor)?.rotulo ?? valor;
}

/** cor de um valor, com o mesmo fallback que TIPO_OS.tom tinha: neutro */
export function tomDoTipo(tipos: TipoOSCompleto[], valor: string): Tom {
  return tipos.find((t) => t.valor === valor)?.tom ?? "neutro";
}

/** o código gravado no banco: só maiúsculas, números e underscore */
function codigoDoRotulo(rotulo: string) {
  return normalizar(rotulo)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export async function criarTipoOS(
  dados: { rotulo: string; tom: string },
  usuarioId: string,
) {
  const rotulo = dados.rotulo.trim();
  if (!rotulo) throw new ErroDeNegocio("Dê um nome ao tipo de OS.");

  const valor = codigoDoRotulo(rotulo);
  if (!valor) {
    throw new ErroDeNegocio("Esse nome não gera um código válido — use letras ou números.");
  }

  const existente = await prisma.tipoOS.findFirst({
    where: { OR: [{ valor }, { rotulo }] },
  });
  if (existente) throw new ErroDeNegocio(`O tipo "${rotulo}" já existe.`);

  const ultima = await prisma.tipoOS.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const criado = await prisma.tipoOS.create({
    data: { valor, rotulo, tom: dados.tom || "neutro", ordem: (ultima?.ordem ?? 0) + 1 },
  });

  await auditar(prisma, {
    entidade: "TipoOS",
    entidadeId: criado.id,
    acao: "CRIACAO",
    descricao: `Tipo de OS "${rotulo}" criado.`,
    usuarioId,
    depois: { valor, rotulo, tom: criado.tom },
  });

  return criado;
}

export async function atualizarTipoOS(
  dados: { id: string; rotulo: string; tom: string; ativo: boolean },
  usuarioId: string,
) {
  const antes = await prisma.tipoOS.findUnique({ where: { id: dados.id } });
  if (!antes) throw new ErroDeNegocio("Tipo de OS não encontrado.");

  const rotulo = dados.rotulo.trim();
  if (!rotulo) throw new ErroDeNegocio("Dê um nome ao tipo de OS.");

  const duplicado = await prisma.tipoOS.findFirst({
    where: { rotulo, id: { not: dados.id } },
  });
  if (duplicado) throw new ErroDeNegocio(`Já existe um tipo chamado "${rotulo}".`);

  const atualizado = await prisma.tipoOS.update({
    where: { id: dados.id },
    data: { rotulo, tom: dados.tom || "neutro", ativo: dados.ativo },
  });

  await auditar(prisma, {
    entidade: "TipoOS",
    entidadeId: atualizado.id,
    acao: "EDICAO",
    descricao: `Tipo de OS "${antes.rotulo}" atualizado.`,
    usuarioId,
    antes: { rotulo: antes.rotulo, tom: antes.tom, ativo: antes.ativo },
    depois: { rotulo, tom: atualizado.tom, ativo: atualizado.ativo },
  });

  return atualizado;
}
