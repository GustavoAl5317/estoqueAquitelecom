import { prisma } from "@/lib/prisma";
import { distanciaKm, posicoesDosTecnicos } from "./frota";
import { atendimentoTipicoPorTipo } from "./eventos";
import { situacaoSla } from "./ordens";
import { STATUS_OS_ABERTOS, TIPO_OS } from "@/lib/dominio";

/**
 * 3.56 — PREVISÃO DE ATRASO.
 *
 * O SLA da tela de OS responde "quanto tempo falta". Esta função responde a
 * pergunta que interessa antes disso: **vai dar tempo?** — somando o
 * deslocamento que ainda falta ao atendimento que o tipo de serviço costuma
 * consumir, e comparando com o prazo.
 *
 * Três cuidados, porque previsão errada custa mais caro que previsão ausente:
 *
 * 1. **A média é a da própria operação**, tirada das OS concluídas nos últimos
 *    30 dias por tipo de serviço. Número de fabricante não descreve Fortaleza.
 *
 * 2. **Quem não tem responsável não tem previsão de deslocamento.** Fingir que
 *    alguém sairia agora esconderia justamente a OS que precisa de decisão.
 *
 * 3. **A velocidade é urbana e conservadora.** A distância é em linha reta; o
 *    carro faz mais quilômetros que isso. Um número otimista aqui viraria
 *    promessa quebrada no cliente.
 */

/** km/h médios no trânsito urbano, já descontando o desvio da linha reta */
const VELOCIDADE_URBANA_KMH = 18;

/** quando não há histórico do tipo, é isto que se supõe de atendimento */
const MINUTOS_ATENDIMENTO_PADRAO = 60;

/**
 * Limites do que se aceita como duração de um atendimento.
 *
 * Mesmo com mediana, uma base pequena pode devolver número sem sentido — e
 * dizer que uma instalação leva doze horas destrói a confiança na tela inteira.
 * Fora da faixa, a previsão prefere errar para o meio.
 */
const MINUTOS_ATENDIMENTO_MINIMO = 15;
const MINUTOS_ATENDIMENTO_MAXIMO = 240;

const dentroDoRazoavel = (minutos: number) =>
  Math.min(
    MINUTOS_ATENDIMENTO_MAXIMO,
    Math.max(MINUTOS_ATENDIMENTO_MINIMO, Math.round(minutos)),
  );

/** abaixo disto o prazo é considerado apertado, ainda que caiba */
const MINUTOS_FOLGA_CONFORTAVEL = 30;

export type RiscoPrevisto =
  | "ESTOURADO"
  | "VAI_ESTOURAR"
  | "APERTADO"
  | "FOLGADO"
  | "SEM_PRAZO";

export type PrevisaoDeAtraso = {
  ordemId: string;
  numero: string;
  cliente: string | null;
  bairro: string | null;
  tipo: string;
  prioridade: string;
  status: string;
  tecnico: { id: string; nome: string } | null;
  distanciaKm: number | null;
  minutosDeslocamento: number | null;
  minutosAtendimento: number;
  conclusaoPrevista: Date | null;
  prazo: Date | null;
  /** minutos entre a conclusão prevista e o prazo; negativo é estouro */
  folgaMinutos: number | null;
  risco: RiscoPrevisto;
  motivo: string;
};

const PESO_RISCO: Record<RiscoPrevisto, number> = {
  ESTOURADO: 0,
  VAI_ESTOURAR: 1,
  APERTADO: 2,
  FOLGADO: 3,
  SEM_PRAZO: 4,
};

export async function previsaoDeAtraso(): Promise<PrevisaoDeAtraso[]> {
  const [ordens, posicoes, tipico] = await Promise.all([
    prisma.ordemServico.findMany({
      where: { status: { in: STATUS_OS_ABERTOS } },
      include: {
        tecnico: { select: { id: true, nome: true } },
        bairro: { select: { nome: true } },
      },
    }),
    posicoesDosTecnicos(),
    atendimentoTipicoPorTipo(30),
  ]);

  const posicaoPor = new Map(posicoes.map((p) => [p.tecnicoId, p]));

  const agora = new Date();

  const previsoes = ordens.map((ordem): PrevisaoDeAtraso => {
    const minutosAtendimento = dentroDoRazoavel(
      tipico.porTipo.get(ordem.tipo) ??
        tipico.global ??
        MINUTOS_ATENDIMENTO_PADRAO,
    );

    const posicao = ordem.tecnicoId ? posicaoPor.get(ordem.tecnicoId) : undefined;

    const temCoordenada = ordem.latitude !== null && ordem.longitude !== null;
    const km =
      posicao && temCoordenada
        ? distanciaKm(posicao, {
            latitude: ordem.latitude!,
            longitude: ordem.longitude!,
          })
        : null;

    // já chegou: o deslocamento acabou, sobra o que falta de atendimento
    const jaNoLocal = Boolean(ordem.chegadaEm && !ordem.saidaEm);

    const minutosDeslocamento = jaNoLocal
      ? 0
      : km === null
        ? null
        : Math.round((km / VELOCIDADE_URBANA_KMH) * 60);

    const decorridoNoLocal = jaNoLocal
      ? Math.max(0, (agora.getTime() - ordem.chegadaEm!.getTime()) / 60_000)
      : 0;

    const restanteAtendimento = Math.max(
      5,
      Math.round(minutosAtendimento - decorridoNoLocal),
    );

    const conclusaoPrevista =
      minutosDeslocamento === null
        ? null
        : new Date(
            agora.getTime() +
              (minutosDeslocamento + restanteAtendimento) * 60_000,
          );

    const folgaMinutos =
      ordem.prazo && conclusaoPrevista
        ? Math.round(
            (ordem.prazo.getTime() - conclusaoPrevista.getTime()) / 60_000,
          )
        : null;

    const { situacao } = situacaoSla(ordem);

    const risco: RiscoPrevisto = !ordem.prazo
      ? "SEM_PRAZO"
      : situacao === "ESTOURADO"
        ? "ESTOURADO"
        : folgaMinutos === null
          ? "SEM_PRAZO"
          : folgaMinutos < 0
            ? "VAI_ESTOURAR"
            : folgaMinutos < MINUTOS_FOLGA_CONFORTAVEL
              ? "APERTADO"
              : "FOLGADO";

    const motivo = !ordem.tecnico
      ? "Sem responsável — o relógio corre e ninguém saiu."
      : !temCoordenada
        ? "OS sem coordenada: dá para prever o atendimento, não o deslocamento."
        : !posicao
          ? `${ordem.tecnico.nome} está sem posição conhecida agora.`
          : jaNoLocal
            ? `No local há ${Math.round(decorridoNoLocal)} min; restam cerca de ${restanteAtendimento} min de atendimento.`
            : `${numeroCurto(km!)} km até o cliente (~${minutosDeslocamento} min) mais ~${restanteAtendimento} min de ${TIPO_OS.rotulo(ordem.tipo).toLowerCase()}.`;

    return {
      ordemId: ordem.id,
      numero: ordem.numero,
      cliente: ordem.cliente,
      bairro: ordem.bairro?.nome ?? ordem.bairroNome,
      tipo: ordem.tipo,
      prioridade: ordem.prioridade,
      status: ordem.status,
      tecnico: ordem.tecnico,
      distanciaKm: km,
      minutosDeslocamento,
      minutosAtendimento: restanteAtendimento,
      conclusaoPrevista,
      prazo: ordem.prazo,
      folgaMinutos,
      risco,
      motivo,
    };
  });

  return previsoes.sort((a, b) => {
    const porRisco = PESO_RISCO[a.risco] - PESO_RISCO[b.risco];
    if (porRisco !== 0) return porRisco;
    return (a.folgaMinutos ?? 99_999) - (b.folgaMinutos ?? 99_999);
  });
}

function numeroCurto(valor: number) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

/**
 * 4.10 — CENTRAL DE DECISÃO.
 *
 * O painel diz como a operação está; a fila diz o que fazer primeiro. Faltava
 * o meio de campo: **o que decidir agora, e o que acontece se ninguém decidir**.
 *
 * Esta função junta as três frentes numa leitura só — o que vai estourar, quem
 * está sem dono e onde a carga desequilibrou — porque a decisão de supervisão
 * é sempre sobre as três ao mesmo tempo.
 */
export async function painelDeDecisao() {
  const previsoes = await previsaoDeAtraso();

  const estouradas = previsoes.filter((p) => p.risco === "ESTOURADO");
  const vaoEstourar = previsoes.filter((p) => p.risco === "VAI_ESTOURAR");
  const apertadas = previsoes.filter((p) => p.risco === "APERTADO");
  const semResponsavel = previsoes.filter((p) => !p.tecnico);
  const semPrevisao = previsoes.filter((p) => p.conclusaoPrevista === null);

  return {
    previsoes,
    resumo: {
      abertas: previsoes.length,
      estouradas: estouradas.length,
      vaoEstourar: vaoEstourar.length,
      apertadas: apertadas.length,
      semResponsavel: semResponsavel.length,
      semPrevisao: semPrevisao.length,
    },
    /** o que entra na tela de decisão: risco real, do mais urgente ao menos */
    emRisco: [...estouradas, ...vaoEstourar, ...apertadas],
  };
}
