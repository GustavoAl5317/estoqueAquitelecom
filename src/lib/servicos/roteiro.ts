import { prisma } from "@/lib/prisma";
import { distanciaKm, situacaoDaFrota } from "./frota";
import { situacaoSla } from "./ordens";
import { PESO_PRIORIDADE, STATUS_OS_ABERTOS } from "@/lib/dominio";

/**
 * 3.31 / 3.32 — ROTEIRIZAÇÃO.
 *
 * Não é caminho de rua: é ordem de visita. O sistema não sabe onde tem
 * semáforo, e fingir que sabe seria pior do que não sugerir nada. O que ele
 * sabe é onde o técnico está, onde estão as OS dele e o que é urgente — e com
 * isso resolve a pergunta que o supervisor faz de verdade: **em que ordem
 * atender**.
 *
 * O algoritmo é vizinho mais próximo com viés de prioridade: a cada passo
 * escolhe a parada com o melhor custo, onde custo = distância penalizada pela
 * urgência. Uma P1 a 6 km ganha de uma P4 a 2 km, que é exatamente o que um
 * supervisor experiente faria — só que sem esquecer nenhuma.
 *
 * Vizinho mais próximo não dá a rota ótima. Dá uma rota boa em tempo
 * instantâneo, e o supervisor continua podendo reordenar. Para 8 ou 10 paradas
 * a diferença para o ótimo é pequena; a diferença para "ordem aleatória" é
 * enorme, e é essa que estamos atacando.
 */

/** velocidade média de deslocamento urbano usada para estimar o tempo */
const KMH_URBANO = 25;
/** tempo médio de permanência em um atendimento, em minutos */
const MINUTOS_POR_ATENDIMENTO: Record<string, number> = {
  INSTALACAO: 90,
  REPARO: 60,
  MANUTENCAO: 60,
  MUDANCA_ENDERECO: 90,
  RETIRADA: 30,
  UPGRADE: 40,
  VISTORIA: 30,
  INFRAESTRUTURA: 120,
  NAO_INFORMADO: 60,
};

export type Parada = {
  ordemId: string;
  numero: string;
  cliente: string | null;
  endereco: string | null;
  bairro: string | null;
  tipo: string;
  prioridade: string;
  status: string;
  latitude: number;
  longitude: number;
  situacao: string;
  minutosRestantes: number | null;
  /** distância desde a parada anterior */
  trechoKm: number;
  /** distância acumulada desde a partida */
  acumuladoKm: number;
  /** horário estimado de chegada */
  chegadaPrevista: Date;
};

export type Roteiro = {
  tecnicoId: string;
  tecnicoNome: string;
  placa: string | null;
  partida: { latitude: number; longitude: number; descricao: string } | null;
  paradas: Parada[];
  /** OS do técnico que ficaram de fora por não terem coordenada */
  semCoordenada: { ordemId: string; numero: string; endereco: string | null }[];
  totalKm: number;
  minutosDeslocamento: number;
  minutosAtendimento: number;
  fimPrevisto: Date | null;
};

export async function roteiroDoTecnico(
  tecnicoId: string,
  opcoes: { partirDe?: { latitude: number; longitude: number } } = {},
): Promise<Roteiro | null> {
  const tecnico = await prisma.tecnico.findUnique({
    where: { id: tecnicoId },
    select: { id: true, nome: true },
  });
  if (!tecnico) return null;

  const ordens = await prisma.ordemServico.findMany({
    where: { tecnicoId, status: { in: STATUS_OS_ABERTOS } },
    include: { bairro: { select: { nome: true } } },
    orderBy: { prioridade: "asc" },
  });

  const frota = await situacaoDaFrota();
  const veiculo = frota.find((v) => v.tecnicoId === tecnicoId) ?? null;

  const partida =
    opcoes.partirDe ??
    (veiculo?.latitude !== null && veiculo?.latitude !== undefined && veiculo.longitude !== null
      ? { latitude: veiculo.latitude, longitude: veiculo.longitude }
      : null);

  const descricaoPartida = opcoes.partirDe
    ? "Ponto informado"
    : veiculo
      ? `${veiculo.placa}${veiculo.endereco ? ` — ${veiculo.endereco}` : ""}`
      : "";

  const comCoordenada = ordens.filter(
    (o) => o.latitude !== null && o.longitude !== null,
  );
  const semCoordenada = ordens
    .filter((o) => o.latitude === null || o.longitude === null)
    .map((o) => ({ ordemId: o.id, numero: o.numero, endereco: o.endereco }));

  const paradas: Parada[] = [];
  let atual = partida;
  let acumulado = 0;
  let relogio = new Date();
  let minutosDeslocamento = 0;
  let minutosAtendimento = 0;

  const pendentes = [...comCoordenada];

  while (pendentes.length) {
    // sem ponto de partida conhecido, começa pela mais urgente
    let escolhido = 0;
    if (atual) {
      let melhorCusto = Infinity;
      pendentes.forEach((ordem, indice) => {
        const km = distanciaKm(atual!, {
          latitude: ordem.latitude!,
          longitude: ordem.longitude!,
        });
        // a urgência encurta a distância percebida, sem nunca zerá-la
        const desconto = 1 + (PESO_PRIORIDADE[ordem.prioridade] ?? 30) / 100;
        const { situacao } = situacaoSla(ordem);
        const atraso = situacao === "ESTOURADO" ? 1.6 : situacao === "ATENCAO" ? 1.3 : 1;
        const custo = km / (desconto * atraso);
        if (custo < melhorCusto) {
          melhorCusto = custo;
          escolhido = indice;
        }
      });
    }

    const ordem = pendentes.splice(escolhido, 1)[0];
    const alvo = { latitude: ordem.latitude!, longitude: ordem.longitude! };
    const trecho = atual ? distanciaKm(atual, alvo) : 0;

    acumulado += trecho;
    const minutosTrecho = Math.round((trecho / KMH_URBANO) * 60);
    minutosDeslocamento += minutosTrecho;
    relogio = new Date(relogio.getTime() + minutosTrecho * 60_000);

    const { situacao, minutosRestantes } = situacaoSla(ordem);

    paradas.push({
      ordemId: ordem.id,
      numero: ordem.numero,
      cliente: ordem.cliente,
      endereco: ordem.endereco,
      bairro: ordem.bairro?.nome ?? ordem.bairroNome,
      tipo: ordem.tipo,
      prioridade: ordem.prioridade,
      status: ordem.status,
      latitude: alvo.latitude,
      longitude: alvo.longitude,
      situacao,
      minutosRestantes,
      trechoKm: Number(trecho.toFixed(2)),
      acumuladoKm: Number(acumulado.toFixed(2)),
      chegadaPrevista: relogio,
    });

    const permanencia = MINUTOS_POR_ATENDIMENTO[ordem.tipo] ?? 60;
    minutosAtendimento += permanencia;
    relogio = new Date(relogio.getTime() + permanencia * 60_000);
    atual = alvo;
  }

  return {
    tecnicoId: tecnico.id,
    tecnicoNome: tecnico.nome,
    placa: veiculo?.placa ?? null,
    partida: partida ? { ...partida, descricao: descricaoPartida } : null,
    paradas,
    semCoordenada,
    totalKm: Number(acumulado.toFixed(2)),
    minutosDeslocamento,
    minutosAtendimento,
    fimPrevisto: paradas.length ? relogio : null,
  };
}

/** 3.31 — o roteiro de todo mundo, para a visão do supervisor. */
export async function roteirosDoDia() {
  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true, ordens: { some: { status: { in: STATUS_OS_ABERTOS } } } },
    select: { id: true },
    orderBy: { nome: "asc" },
  });

  const roteiros = await Promise.all(
    tecnicos.map((t) => roteiroDoTecnico(t.id)),
  );

  return roteiros.filter((r): r is Roteiro => r !== null);
}

/**
 * 3.32 — quanto a ordem sugerida economiza em relação a atender na ordem em que
 * as OS foram abertas. É o número que justifica a tela existir.
 */
export function economiaDoRoteiro(roteiro: Roteiro) {
  if (roteiro.paradas.length < 2 || !roteiro.partida) return null;

  const naOrdemDeChegada = [...roteiro.paradas].sort((a, b) =>
    a.numero.localeCompare(b.numero),
  );

  let km = 0;
  let anterior: { latitude: number; longitude: number } = roteiro.partida;
  for (const parada of naOrdemDeChegada) {
    km += distanciaKm(anterior, parada);
    anterior = parada;
  }

  const diferenca = km - roteiro.totalKm;
  return {
    kmSemRoteiro: Number(km.toFixed(2)),
    kmComRoteiro: roteiro.totalKm,
    economiaKm: Number(diferenca.toFixed(2)),
    economiaPercentual: km > 0 ? Math.round((diferenca / km) * 100) : 0,
  };
}
