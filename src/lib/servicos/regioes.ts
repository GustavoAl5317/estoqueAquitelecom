import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar } from "./nucleo";
import { situacaoSla } from "./ordens";
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

// ---------------------------------------------------------------------------
// 3.17 — POLÍGONO DO BAIRRO
//
// O bairro por nome resolve a maior parte da operação, mas não resolve a OS que
// chega do SGP só com coordenada: o SGP manda latitude e longitude, e nenhum
// campo que diga o bairro. Com o contorno desenhado, a coordenada encontra o
// bairro sozinha — e junto com ele vêm o responsável e a região.
//
// O contorno é desenhado na tela, clicando no mapa. Não existe base oficial de
// limite de bairro para importar, e aproximar à mão o que a operação já conhece
// vale mais do que esperar por um dado que não vai chegar.
// ---------------------------------------------------------------------------

/** vértice como `[latitude, longitude]` */
export type Vertice = [number, number];

export function lerPoligono(bruto: string | null | undefined): Vertice[] {
  if (!bruto) return [];
  try {
    const dados = JSON.parse(bruto);
    if (!Array.isArray(dados)) return [];
    return dados
      .filter(
        (v): v is Vertice =>
          Array.isArray(v) &&
          v.length === 2 &&
          Number.isFinite(v[0]) &&
          Number.isFinite(v[1]),
      )
      .map(([lat, lng]) => [Number(lat), Number(lng)] as Vertice);
  } catch {
    return [];
  }
}

/**
 * Ponto dentro do polígono, pelo método do raio.
 *
 * Conta quantas vezes uma semirreta partindo do ponto cruza as arestas: ímpar
 * está dentro, par está fora. Em escala de bairro a curvatura da Terra não
 * muda o resultado, então trata-se latitude e longitude como plano.
 */
export function pontoNoPoligono(
  ponto: { latitude: number; longitude: number },
  poligono: Vertice[],
) {
  if (poligono.length < 3) return false;

  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const [latI, lngI] = poligono[i];
    const [latJ, lngJ] = poligono[j];

    const cruza =
      latI > ponto.latitude !== latJ > ponto.latitude &&
      ponto.longitude <
        ((lngJ - lngI) * (ponto.latitude - latI)) / (latJ - latI) + lngI;

    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/** 3.17 — qual bairro contém esta coordenada, se algum tiver contorno. */
export async function bairroDaCoordenada(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const bairros = await prisma.bairro.findMany({
    where: { poligono: { not: null } },
    select: { id: true, nome: true, cidade: true, poligono: true },
  });

  for (const bairro of bairros) {
    if (pontoNoPoligono({ latitude, longitude }, lerPoligono(bairro.poligono))) {
      return { id: bairro.id, nome: bairro.nome, cidade: bairro.cidade };
    }
  }
  return null;
}

export async function salvarPoligono(
  dados: { bairroId: string; vertices: Vertice[] },
  usuarioId: string,
) {
  const bairro = await prisma.bairro.findUnique({
    where: { id: dados.bairroId },
  });
  if (!bairro) throw new ErroDeNegocio("Bairro não encontrado.");

  // apagar o contorno é legítimo; um contorno de dois pontos, não
  if (dados.vertices.length > 0 && dados.vertices.length < 3) {
    throw new ErroDeNegocio(
      "Um contorno precisa de pelo menos três pontos. Continue marcando no mapa ou limpe o desenho.",
    );
  }

  const poligono = dados.vertices.length ? JSON.stringify(dados.vertices) : null;

  const atualizado = await prisma.bairro.update({
    where: { id: bairro.id },
    data: { poligono },
  });

  await auditar(prisma, {
    entidade: "Bairro",
    entidadeId: bairro.id,
    acao: "EDICAO",
    descricao: poligono
      ? `Contorno de ${bairro.nome} definido com ${dados.vertices.length} pontos.`
      : `Contorno de ${bairro.nome} removido.`,
    usuarioId,
    antes: { pontos: lerPoligono(bairro.poligono).length },
    depois: { pontos: dados.vertices.length },
  });

  return atualizado;
}

/**
 * 3.43 / 3.44 / 3.45 — PERFORMANCE TERRITORIAL.
 *
 * Cobertura diz onde há responsável; performance diz onde a operação está
 * entregando. São perguntas diferentes e a segunda só faz sentido por região:
 * comparar bairros isolados produz média de amostra pequena demais para
 * sustentar decisão.
 *
 * Região sem OS no período aparece assim mesmo, com traço. Sumir com ela
 * esconderia justamente a área que ninguém está atendendo.
 */
export async function performancePorRegiao(dias = 30) {
  const desde = new Date(Date.now() - dias * 86_400_000);

  const [regioes, ordens] = await Promise.all([
    prisma.regiao.findMany({
      select: { id: true, nome: true, _count: { select: { bairros: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.ordemServico.findMany({
      where: {
        OR: [
          { concluidaEm: { gte: desde } },
          { status: { in: STATUS_OS_ABERTOS } },
        ],
      },
      select: {
        status: true,
        prazo: true,
        abertaEm: true,
        concluidaEm: true,
        minutosNoLocal: true,
        bairro: { select: { regiaoId: true } },
      },
    }),
  ]);

  const porRegiao = new Map<string, typeof ordens>();
  for (const ordem of ordens) {
    const chave = ordem.bairro?.regiaoId ?? "";
    const lista = porRegiao.get(chave) ?? [];
    lista.push(ordem);
    porRegiao.set(chave, lista);
  }

  const medir = (lista: typeof ordens, nome: string, bairros: number) => {
    const abertas = lista.filter((o) => STATUS_OS_ABERTOS.includes(o.status));
    const concluidas = lista.filter((o) => o.concluidaEm);

    const comPrazo = concluidas.filter((o) => o.prazo);
    const noPrazo = comPrazo.filter(
      (o) => situacaoSla(o).situacao === "CONCLUIDA_NO_PRAZO",
    );

    const horas = concluidas
      .filter((o) => o.concluidaEm)
      .map((o) => (o.concluidaEm!.getTime() - o.abertaEm.getTime()) / 3_600_000);

    const permanencias = concluidas
      .map((o) => o.minutosNoLocal)
      .filter((m): m is number => m !== null);

    const media = (valores: number[]) =>
      valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;

    return {
      nome,
      bairros,
      abertas: abertas.length,
      emRisco: abertas.filter((o) => {
        const { situacao } = situacaoSla(o);
        return situacao === "ESTOURADO" || situacao === "ATENCAO";
      }).length,
      concluidas: concluidas.length,
      aderenciaSla: comPrazo.length
        ? Math.round((noPrazo.length / comPrazo.length) * 100)
        : null,
      horasMedias: media(horas),
      minutosNoLocal: permanencias.length
        ? Math.round(media(permanencias)!)
        : null,
    };
  };

  const linhas = regioes.map((regiao) =>
    medir(porRegiao.get(regiao.id) ?? [], regiao.nome, regiao._count.bairros),
  );

  const soltas = porRegiao.get("") ?? [];

  return {
    dias,
    linhas,
    semRegiao: soltas.length ? medir(soltas, "Fora de região", 0) : null,
  };
}

export type Sugestao = {
  /** COBERTURA | CARGA | PRAZO */
  tipo: string;
  tom: "critico" | "atencao" | "informativo";
  titulo: string;
  detalhe: string;
  href: string;
};

/**
 * 3.46 / 3.57 — REBALANCEAMENTO SUGERIDO.
 *
 * O sistema não redistribui nada sozinho. Ele aponta o desequilíbrio, escreve
 * o motivo e leva para a tela onde a pessoa decide — mesma regra da fila: a
 * recomendação vira um caminho, nunca um fato consumado.
 *
 * Três desequilíbrios importam, nesta ordem: área sem dono, carga desigual e
 * prazo concentrado. Área sem dono vem primeiro porque é a única que nenhuma
 * outra decisão resolve.
 */
export async function sugestoesDeRebalanceamento(): Promise<Sugestao[]> {
  const [bairros, tecnicos] = await Promise.all([
    prisma.bairro.findMany({
      include: {
        regiao: { select: { nome: true } },
        ordens: {
          where: { status: { in: STATUS_OS_ABERTOS } },
          select: { id: true, prazo: true, concluidaEm: true, status: true },
        },
      },
    }),
    prisma.tecnico.findMany({
      where: { ativo: true, status: { not: "FORA_JORNADA" } },
      select: {
        id: true,
        nome: true,
        ordens: {
          where: { status: { in: STATUS_OS_ABERTOS } },
          select: { id: true },
        },
      },
    }),
  ]);

  const sugestoes: Sugestao[] = [];

  // --- 1. área sem dono ----------------------------------------------------
  const semResponsavel = bairros
    .filter((b) => !b.responsavelPrincipalId && b.ordens.length > 0)
    .sort((a, b) => b.ordens.length - a.ordens.length);

  for (const bairro of semResponsavel.slice(0, 5)) {
    sugestoes.push({
      tipo: "COBERTURA",
      tom: "critico",
      titulo: `${bairro.nome} está sem responsável`,
      detalhe: `${bairro.ordens.length} OS aberta(s) na área${
        bairro.regiao ? ` (região ${bairro.regiao.nome})` : ""
      }. Sem dono, ninguém pontua por região na recomendação da fila.`,
      href: "/regioes",
    });
  }

  const semReserva = bairros.filter(
    (b) => b.responsavelPrincipalId && !b.responsavelSecundarioId,
  );
  if (semReserva.length) {
    sugestoes.push({
      tipo: "COBERTURA",
      tom: "informativo",
      titulo: `${semReserva.length} bairro(s) sem reserva`,
      detalhe:
        "Têm responsável principal, mas ninguém cobre férias, folga ou atestado.",
      href: "/regioes",
    });
  }

  // --- 2. carga desigual ---------------------------------------------------
  const cargas = tecnicos.map((t) => ({
    id: t.id,
    nome: t.nome,
    abertas: t.ordens.length,
  }));

  if (cargas.length >= 2) {
    const media = cargas.reduce((s, c) => s + c.abertas, 0) / cargas.length;
    const ordenadas = [...cargas].sort((a, b) => b.abertas - a.abertas);
    const maior = ordenadas[0];
    const menor = ordenadas[ordenadas.length - 1];

    // só vale falar em desequilíbrio quando há volume e a diferença é real
    if (media >= 1 && maior.abertas >= 3 && maior.abertas - menor.abertas >= 3) {
      sugestoes.push({
        tipo: "CARGA",
        tom: "atencao",
        titulo: `${maior.nome} está com ${maior.abertas} OS; ${menor.nome}, com ${menor.abertas}`,
        detalhe: `A média da equipe é ${media.toFixed(1)}. Passar ${Math.ceil(
          (maior.abertas - menor.abertas) / 2,
        )} atendimento(s) equilibra a fila sem estourar ninguém.`,
        href: `/os/quadro?recorte=TECNICO`,
      });
    }
  }

  // --- 3. prazo concentrado ------------------------------------------------
  const riscoPorBairro = bairros
    .map((bairro) => ({
      nome: bairro.nome,
      id: bairro.id,
      emRisco: bairro.ordens.filter((o) => {
        const { situacao } = situacaoSla(o);
        return situacao === "ESTOURADO" || situacao === "ATENCAO";
      }).length,
    }))
    .filter((b) => b.emRisco >= 2)
    .sort((a, b) => b.emRisco - a.emRisco);

  for (const bairro of riscoPorBairro.slice(0, 3)) {
    sugestoes.push({
      tipo: "PRAZO",
      tom: "critico",
      titulo: `${bairro.nome} concentra ${bairro.emRisco} OS em risco de prazo`,
      detalhe:
        "Atendimentos próximos entre si podem ser feitos na mesma saída — o roteiro do dia resolve mais rápido que a fila avulsa.",
      href: "/roteiro",
    });
  }

  return sugestoes;
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
