import { prisma } from "@/lib/prisma";
import { STATUS_OS_ABERTOS, TIPO_OS } from "@/lib/dominio";
import { distanciaKm } from "./frota";

/**
 * 2.25 a 2.28 — O QUE O SGP NÃO ENXERGA.
 *
 * Um sistema de OS registra chamados um a um. O que a operação precisa saber é
 * o que eles formam juntos: o cliente que voltou pela quarta vez, o bairro que
 * abriu dezoito ordens em três horas, o punhado de endereços dentro de um raio
 * de um quilômetro que provavelmente é um cabo rompido e não dezoito problemas.
 *
 * Nada aqui cria incidente sozinho. O sistema levanta a hipótese e mostra o
 * que a sustenta; confirmar é decisão de quem conhece a rede — e um incidente
 * declarado por engano muda a prioridade de tudo.
 */

// ---------------------------------------------------------------------------
// 2.25 — Reincidência
// ---------------------------------------------------------------------------

export type Reincidencia = {
  chave: string;
  cliente: string;
  contrato: string | null;
  ordens: number;
  tipos: { tipo: string; quantidade: number }[];
  ultimaEm: Date;
  abertas: number;
  ordensIds: string[];
};

/**
 * Clientes com mais de uma OS no período.
 *
 * A identidade do cliente vem do contrato quando existe, e do nome quando não:
 * o SGP nem sempre traz contrato, e agrupar só por nome erraria em homônimos —
 * por isso o contrato tem precedência.
 */
export async function reincidencias(
  dias = 30,
  minimo = 2,
): Promise<Reincidencia[]> {
  const desde = new Date(Date.now() - dias * 86_400_000);

  const ordens = await prisma.ordemServico.findMany({
    where: { abertaEm: { gte: desde }, cliente: { not: null } },
    select: {
      id: true,
      cliente: true,
      contrato: true,
      tipo: true,
      status: true,
      abertaEm: true,
    },
    orderBy: { abertaEm: "desc" },
  });

  const grupos = new Map<string, Reincidencia>();

  for (const ordem of ordens) {
    const chave = ordem.contrato?.trim() || `nome:${ordem.cliente}`;
    const atual = grupos.get(chave) ?? {
      chave,
      cliente: ordem.cliente!,
      contrato: ordem.contrato,
      ordens: 0,
      tipos: [],
      ultimaEm: ordem.abertaEm,
      abertas: 0,
      ordensIds: [],
    };

    atual.ordens += 1;
    atual.ordensIds.push(ordem.id);
    if (STATUS_OS_ABERTOS.includes(ordem.status)) atual.abertas += 1;
    if (ordem.abertaEm > atual.ultimaEm) atual.ultimaEm = ordem.abertaEm;

    const tipo = atual.tipos.find((t) => t.tipo === ordem.tipo);
    if (tipo) tipo.quantidade += 1;
    else atual.tipos.push({ tipo: ordem.tipo, quantidade: 1 });

    grupos.set(chave, atual);
  }

  return [...grupos.values()]
    .filter((g) => g.ordens >= minimo)
    .map((g) => ({
      ...g,
      tipos: g.tipos.sort((a, b) => b.quantidade - a.quantidade),
    }))
    .sort((a, b) => b.ordens - a.ordens || +b.ultimaEm - +a.ultimaEm);
}

/** quantas OS o cliente de uma ordem abriu no período — usado pela severidade */
export async function reincidenciasPorChave(dias = 30) {
  const lista = await reincidencias(dias, 1);
  return new Map(lista.map((r) => [r.chave, r.ordens]));
}

// ---------------------------------------------------------------------------
// 2.26 — Concentração por bairro
// ---------------------------------------------------------------------------

export type ConcentracaoBairro = {
  bairroId: string | null;
  bairro: string;
  total: number;
  tipoPredominante: string;
  doTipo: number;
  primeira: Date;
  ultima: Date;
  tecnicosNaRegiao: number;
};

/** 2.26 — onde as ordens estão se acumulando agora. */
export async function concentracaoPorBairro(
  horas = 6,
  minimo = 3,
): Promise<ConcentracaoBairro[]> {
  const desde = new Date(Date.now() - horas * 3_600_000);

  const ordens = await prisma.ordemServico.findMany({
    where: { abertaEm: { gte: desde }, status: { in: STATUS_OS_ABERTOS } },
    select: {
      tipo: true,
      abertaEm: true,
      bairroId: true,
      bairroNome: true,
      bairro: { select: { nome: true } },
    },
  });

  type Grupo = {
    bairroId: string | null;
    bairro: string;
    datas: Date[];
    tipos: Map<string, number>;
  };
  const grupos = new Map<string, Grupo>();

  for (const ordem of ordens) {
    const nome = ordem.bairro?.nome ?? ordem.bairroNome ?? "Sem bairro";
    const chave = ordem.bairroId ?? nome;
    const atual: Grupo = grupos.get(chave) ?? {
      bairroId: ordem.bairroId,
      bairro: nome,
      datas: [],
      tipos: new Map<string, number>(),
    };
    atual.datas.push(ordem.abertaEm);
    atual.tipos.set(ordem.tipo, (atual.tipos.get(ordem.tipo) ?? 0) + 1);
    grupos.set(chave, atual);
  }

  const resultado: ConcentracaoBairro[] = [];

  for (const grupo of grupos.values()) {
    if (grupo.datas.length < minimo) continue;

    const [tipoPredominante, doTipo] = [...grupo.tipos.entries()].sort(
      (a, b) => b[1] - a[1],
    )[0];

    const tecnicos = grupo.bairroId
      ? await prisma.tecnico.count({
          where: {
            ativo: true,
            status: { not: "FORA_JORNADA" },
            OR: [
              { bairrosPrimario: { some: { id: grupo.bairroId } } },
              { bairrosSecundario: { some: { id: grupo.bairroId } } },
            ],
          },
        })
      : 0;

    const ordenadas = grupo.datas.sort((a, b) => +a - +b);

    resultado.push({
      bairroId: grupo.bairroId,
      bairro: grupo.bairro,
      total: grupo.datas.length,
      tipoPredominante,
      doTipo,
      primeira: ordenadas[0],
      ultima: ordenadas.at(-1)!,
      tecnicosNaRegiao: tecnicos,
    });
  }

  return resultado.sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// 2.27 / 2.28 — Possível incidente
// ---------------------------------------------------------------------------

export type PossivelIncidente = {
  id: string;
  tipo: string;
  bairro: string | null;
  ordens: {
    id: string;
    numero: string;
    cliente: string | null;
    endereco: string | null;
    abertaEm: Date;
    latitude: number;
    longitude: number;
  }[];
  raioKm: number;
  centro: { latitude: number; longitude: number };
  primeira: Date;
  ultima: Date;
  minutosDeJanela: number;
  confianca: "ALTA" | "MEDIA";
};

/**
 * 2.27 — o critério.
 *
 * Cinco ou mais OS do mesmo tipo, dentro de um raio pequeno, abertas em
 * intervalo curto. Os três ao mesmo tempo — sem o raio, "sem conexão" na cidade
 * inteira viraria incidente; sem a janela, um bairro problemático viraria
 * incidente todo dia.
 *
 * O agrupamento é por proximidade real, não por bairro: um rompimento não
 * respeita divisa administrativa, e duas ruas vizinhas de bairros diferentes
 * são o mesmo evento.
 */
export async function possiveisIncidentes(opcoes?: {
  raioKm?: number;
  minutos?: number;
  minimo?: number;
}): Promise<PossivelIncidente[]> {
  const raioKm = opcoes?.raioKm ?? 1.2;
  const janelaMinutos = opcoes?.minutos ?? 180;
  const minimo = opcoes?.minimo ?? 5;

  const desde = new Date(Date.now() - janelaMinutos * 60_000);

  const ordens = await prisma.ordemServico.findMany({
    where: {
      abertaEm: { gte: desde },
      status: { in: STATUS_OS_ABERTOS },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      numero: true,
      cliente: true,
      endereco: true,
      tipo: true,
      abertaEm: true,
      latitude: true,
      longitude: true,
      bairroNome: true,
      bairro: { select: { nome: true } },
    },
    orderBy: { abertaEm: "asc" },
  });

  const incidentes: PossivelIncidente[] = [];

  // agrupamento por tipo, e dentro dele por vizinhança
  const porTipo = new Map<string, typeof ordens>();
  for (const ordem of ordens) {
    porTipo.set(ordem.tipo, [...(porTipo.get(ordem.tipo) ?? []), ordem]);
  }

  for (const [tipo, lista] of porTipo) {
    const usadas = new Set<string>();

    for (const semente of lista) {
      if (usadas.has(semente.id)) continue;

      const grupo = lista.filter(
        (o) =>
          !usadas.has(o.id) &&
          distanciaKm(
            { latitude: semente.latitude!, longitude: semente.longitude! },
            { latitude: o.latitude!, longitude: o.longitude! },
          ) <= raioKm,
      );

      if (grupo.length < minimo) continue;
      for (const o of grupo) usadas.add(o.id);

      const latitudes = grupo.map((o) => o.latitude!);
      const longitudes = grupo.map((o) => o.longitude!);
      const centro = {
        latitude: latitudes.reduce((s, v) => s + v, 0) / grupo.length,
        longitude: longitudes.reduce((s, v) => s + v, 0) / grupo.length,
      };

      const raioReal = Math.max(
        ...grupo.map((o) =>
          distanciaKm(centro, {
            latitude: o.latitude!,
            longitude: o.longitude!,
          }),
        ),
      );

      const datas = grupo.map((o) => o.abertaEm).sort((a, b) => +a - +b);
      const janela = Math.round((+datas.at(-1)! - +datas[0]) / 60_000);

      incidentes.push({
        id: `${tipo}-${semente.id}`,
        tipo,
        bairro: semente.bairro?.nome ?? semente.bairroNome,
        ordens: grupo.map((o) => ({
          id: o.id,
          numero: o.numero,
          cliente: o.cliente,
          endereco: o.endereco,
          abertaEm: o.abertaEm,
          latitude: o.latitude!,
          longitude: o.longitude!,
        })),
        raioKm: Number(raioReal.toFixed(2)),
        centro,
        primeira: datas[0],
        ultima: datas.at(-1)!,
        minutosDeJanela: janela,
        // muitas ordens em pouco tempo e pouco espaço: dificilmente coincidência
        confianca: grupo.length >= 8 && janela <= 60 ? "ALTA" : "MEDIA",
      });
    }
  }

  return incidentes.sort((a, b) => b.ordens.length - a.ordens.length);
}

/**
 * 2.24 — leitura curta do que os três sinais acima estão dizendo, para o topo
 * da tela. Frases, não números soltos.
 */
export async function analisePrimaria() {
  const [incidentes, concentracoes, repetidos] = await Promise.all([
    possiveisIncidentes(),
    concentracaoPorBairro(),
    reincidencias(30, 3),
  ]);

  const frases: {
    tom: "critico" | "atencao" | "informativo" | "positivo";
    texto: string;
  }[] = [];

  for (const incidente of incidentes.slice(0, 3)) {
    frases.push({
      tom: incidente.confianca === "ALTA" ? "critico" : "atencao",
      texto:
        `${incidente.ordens.length} OS de ${TIPO_OS.rotulo(incidente.tipo).toLowerCase()} ` +
        `foram abertas num raio de ${incidente.raioKm} km em ${incidente.minutosDeJanela} min` +
        `${incidente.bairro ? ` (${incidente.bairro})` : ""}. ` +
        `Pode ser um problema comum de infraestrutura.`,
    });
  }

  for (const concentracao of concentracoes.slice(0, 2)) {
    if (incidentes.some((i) => i.bairro === concentracao.bairro)) continue;
    frases.push({
      tom: concentracao.tecnicosNaRegiao === 0 ? "critico" : "atencao",
      texto:
        `${concentracao.bairro} concentra ${concentracao.total} OS abertas nas últimas horas ` +
        `(${concentracao.doTipo} de ${TIPO_OS.rotulo(concentracao.tipoPredominante).toLowerCase()})` +
        `${concentracao.tecnicosNaRegiao === 0 ? " e não tem técnico responsável em jornada" : ""}.`,
    });
  }

  if (repetidos.length) {
    frases.push({
      tom: "atencao",
      texto:
        `${repetidos.length} cliente(s) abriram 3 ou mais OS em 30 dias. ` +
        `O caso mais grave é ${repetidos[0].cliente}, com ${repetidos[0].ordens}.`,
    });
  }

  if (!frases.length) {
    frases.push({
      tom: "positivo",
      texto:
        "Nenhuma concentração, incidente provável ou reincidência relevante no período.",
    });
  }

  return { frases, incidentes, concentracoes, repetidos };
}
