import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar } from "./nucleo";
import { STATUS_OS_ABERTOS } from "@/lib/dominio";

/**
 * 3.24 / 3.25 — REGIÕES E BAIRROS.
 *
 * O provedor não pensa em coordenadas, pensa em bairro. Aqui o bairro é a
 * unidade de responsabilidade: tem um técnico principal, um reserva e uma
 * equipe. É o que permite responder "de quem é essa área" sem depender de
 * polígono desenhado no mapa — e é o critério `naRegiao` do score do Bloco 4.
 *
 * Região é só o agrupamento de bairros que a operação usa para falar de metas
 * e de cobertura.
 */

export async function listarRegioes() {
  const regioes = await prisma.regiao.findMany({
    include: {
      bairros: {
        include: {
          responsavelPrincipal: { select: { id: true, nome: true } },
          responsavelSecundario: { select: { id: true, nome: true } },
          equipe: { select: { id: true, nome: true } },
          _count: { select: { ordens: true } },
        },
        orderBy: { nome: "asc" },
      },
    },
    orderBy: { nome: "asc" },
  });

  const semRegiao = await prisma.bairro.findMany({
    where: { regiaoId: null },
    include: {
      responsavelPrincipal: { select: { id: true, nome: true } },
      responsavelSecundario: { select: { id: true, nome: true } },
      equipe: { select: { id: true, nome: true } },
      _count: { select: { ordens: true } },
    },
    orderBy: { nome: "asc" },
  });

  return { regioes, semRegiao };
}

export async function criarRegiao(nome: string, usuarioId: string) {
  const limpo = nome.trim();
  if (!limpo) throw new ErroDeNegocio("Informe o nome da região.");

  const existente = await prisma.regiao.findUnique({ where: { nome: limpo } });
  if (existente) throw new ErroDeNegocio(`A região ${limpo} já existe.`);

  const regiao = await prisma.regiao.create({ data: { nome: limpo } });

  await auditar(prisma, {
    entidade: "Regiao",
    entidadeId: regiao.id,
    acao: "CRIACAO",
    descricao: `Região ${limpo} criada.`,
    usuarioId,
    depois: { nome: limpo },
  });

  return regiao;
}

export async function salvarBairro(
  dados: {
    id?: string | null;
    nome: string;
    cidade: string;
    regiaoId?: string | null;
    responsavelPrincipalId?: string | null;
    responsavelSecundarioId?: string | null;
    equipeId?: string | null;
  },
  usuarioId: string,
) {
  const nome = dados.nome.trim();
  const cidade = dados.cidade.trim();
  if (!nome) throw new ErroDeNegocio("Informe o nome do bairro.");
  if (!cidade) throw new ErroDeNegocio("Informe a cidade.");

  if (
    dados.responsavelPrincipalId &&
    dados.responsavelPrincipalId === dados.responsavelSecundarioId
  ) {
    throw new ErroDeNegocio(
      "O responsável reserva precisa ser diferente do principal — senão não há reserva.",
    );
  }

  const conteudo = {
    nome,
    cidade,
    regiaoId: dados.regiaoId || null,
    responsavelPrincipalId: dados.responsavelPrincipalId || null,
    responsavelSecundarioId: dados.responsavelSecundarioId || null,
    equipeId: dados.equipeId || null,
  };

  if (dados.id) {
    const antes = await prisma.bairro.findUnique({ where: { id: dados.id } });
    if (!antes) throw new ErroDeNegocio("Bairro não encontrado.");

    const bairro = await prisma.bairro.update({
      where: { id: dados.id },
      data: conteudo,
    });

    // as OS já lançadas guardam o nome do bairro por cópia; mantém coerente
    if (antes.nome !== nome) {
      await prisma.ordemServico.updateMany({
        where: { bairroId: bairro.id },
        data: { bairroNome: nome },
      });
    }

    await auditar(prisma, {
      entidade: "Bairro",
      entidadeId: bairro.id,
      acao: "EDICAO",
      descricao: `Bairro ${nome} atualizado.`,
      usuarioId,
      antes: { responsavel: antes.responsavelPrincipalId, regiao: antes.regiaoId },
      depois: {
        responsavel: conteudo.responsavelPrincipalId,
        regiao: conteudo.regiaoId,
      },
    });

    return bairro;
  }

  const duplicado = await prisma.bairro.findUnique({
    where: { nome_cidade: { nome, cidade } },
  });
  if (duplicado) throw new ErroDeNegocio(`${nome} (${cidade}) já está cadastrado.`);

  const bairro = await prisma.bairro.create({ data: conteudo });

  await auditar(prisma, {
    entidade: "Bairro",
    entidadeId: bairro.id,
    acao: "CRIACAO",
    descricao: `Bairro ${nome} (${cidade}) criado.`,
    usuarioId,
    depois: conteudo,
  });

  return bairro;
}

/** 3.26 — cobertura: quanto cada região está pesando na operação agora. */
export async function coberturaPorRegiao() {
  const { regioes, semRegiao } = await listarRegioes();

  const abertas = await prisma.ordemServico.groupBy({
    by: ["bairroId"],
    where: { status: { in: STATUS_OS_ABERTOS }, bairroId: { not: null } },
    _count: { _all: true },
  });

  const porBairro = new Map(abertas.map((a) => [a.bairroId!, a._count._all]));

  const linhas = regioes.map((regiao) => ({
    id: regiao.id,
    nome: regiao.nome,
    bairros: regiao.bairros.length,
    semResponsavel: regiao.bairros.filter((b) => !b.responsavelPrincipalId).length,
    semReserva: regiao.bairros.filter((b) => !b.responsavelSecundarioId).length,
    osAbertas: regiao.bairros.reduce((s, b) => s + (porBairro.get(b.id) ?? 0), 0),
  }));

  return {
    linhas,
    soltos: {
      bairros: semRegiao.length,
      osAbertas: semRegiao.reduce((s, b) => s + (porBairro.get(b.id) ?? 0), 0),
    },
  };
}

/** bairros em que o técnico é o responsável — usado pelo score (`naRegiao`). */
export async function bairrosDoTecnico(tecnicoId: string) {
  return prisma.bairro.findMany({
    where: {
      OR: [
        { responsavelPrincipalId: tecnicoId },
        { responsavelSecundarioId: tecnicoId },
      ],
    },
    select: { id: true, nome: true, responsavelPrincipalId: true },
  });
}
