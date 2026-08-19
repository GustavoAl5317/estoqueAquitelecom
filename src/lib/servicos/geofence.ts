import { prisma } from "@/lib/prisma";
import { distanciaKm } from "./frota";
import { registrarEvento } from "./eventos";
import { parametros } from "./parametros";
import { STATUS_OS_ABERTOS } from "@/lib/dominio";

/**
 * 3.34 / 3.35 / 3.36 — CERCA, CHEGADA E TEMPO NO LOCAL.
 *
 * A cerca aqui não é um polígono desenhado à mão: é o raio em torno da própria
 * OS. A operação não precisa de uma área nomeada — precisa saber se o técnico
 * chegou no cliente, e a coordenada do cliente já vem do SGP.
 *
 * Três decisões que valem registro:
 *
 * 1. **Chegar é um fato; mudar de status é uma decisão.** A chegada é sempre
 *    registrada. Mover a OS para "em atendimento" sozinho só acontece se a
 *    Central ligar `moverAoChegar` — automatizar o status de alguém sem que a
 *    pessoa peça produz registro bonito e realidade errada.
 *
 * 2. **Sair exige folga.** A saída só conta quando o técnico se afasta bem
 *    além do raio (`FOLGA_SAIDA`). Sem isso, uma leitura de GPS ruim no meio do
 *    atendimento encerraria a permanência e abriria outra em seguida.
 *
 * 3. **O relógio é o da leitura**, não o do servidor: posição de rastreador
 *    chega atrasada, e datar pelo recebimento inflaria todo tempo no local.
 */

/** o quanto além do raio o técnico precisa estar para a saída valer */
const FOLGA_SAIDA = 1.6;

export type ChegadaDetectada = {
  ordemId: string;
  numero: string;
  metros: number;
  moveuStatus: boolean;
};

export type SaidaDetectada = {
  ordemId: string;
  numero: string;
  minutosNoLocal: number;
};

export type ResultadoGeofence = {
  chegadas: ChegadaDetectada[];
  saidas: SaidaDetectada[];
};

const VAZIO: ResultadoGeofence = { chegadas: [], saidas: [] };

/**
 * Confronta uma posição do técnico com as OS que estão na mão dele.
 *
 * Roda a cada leitura — do navegador do próprio técnico ou do rastreador — e é
 * silenciosa por natureza: quando nada muda, não escreve nada.
 */
export async function avaliarGeofence(dados: {
  tecnicoId: string;
  latitude: number;
  longitude: number;
  capturadoEm?: Date;
  usuarioId?: string | null;
}): Promise<ResultadoGeofence> {
  const ordens = await prisma.ordemServico.findMany({
    where: {
      tecnicoId: dados.tecnicoId,
      status: { in: STATUS_OS_ABERTOS },
      latitude: { not: null },
      longitude: { not: null },
    },
    select: {
      id: true,
      numero: true,
      status: true,
      latitude: true,
      longitude: true,
      chegadaEm: true,
      saidaEm: true,
    },
  });

  if (!ordens.length) return VAZIO;

  const config = await parametros();
  const raioKm = Math.max(config.raioChegadaMetros, 20) / 1000;
  const quando = dados.capturadoEm ?? new Date();
  const posicao = { latitude: dados.latitude, longitude: dados.longitude };

  const resultado: ResultadoGeofence = { chegadas: [], saidas: [] };

  for (const ordem of ordens) {
    const km = distanciaKm(posicao, {
      latitude: ordem.latitude!,
      longitude: ordem.longitude!,
    });

    // --- chegada ----------------------------------------------------------
    if (km <= raioKm && !ordem.chegadaEm) {
      const moveuStatus =
        config.moverAoChegar === 1 &&
        (ordem.status === "ATRIBUIDA" || ordem.status === "EM_DESLOCAMENTO");

      await prisma.ordemServico.update({
        where: { id: ordem.id },
        data: {
          chegadaEm: quando,
          saidaEm: null,
          minutosNoLocal: null,
          ...(moveuStatus ? { status: "EM_ATENDIMENTO" } : {}),
        },
      });

      await registrarEvento({
        ordemServicoId: ordem.id,
        tipo: "CHEGADA",
        descricao: `Chegada detectada a ${Math.round(km * 1000)} m do endereço.${
          moveuStatus ? " Situação movida para em atendimento." : ""
        }`,
        status: moveuStatus ? "EM_ATENDIMENTO" : null,
        usuarioId: dados.usuarioId ?? null,
        ocorreuEm: quando,
      });

      resultado.chegadas.push({
        ordemId: ordem.id,
        numero: ordem.numero,
        metros: Math.round(km * 1000),
        moveuStatus,
      });
      continue;
    }

    // --- saída ------------------------------------------------------------
    if (km > raioKm * FOLGA_SAIDA && ordem.chegadaEm && !ordem.saidaEm) {
      const minutos = Math.max(
        0,
        Math.round((quando.getTime() - ordem.chegadaEm.getTime()) / 60_000),
      );

      await prisma.ordemServico.update({
        where: { id: ordem.id },
        data: { saidaEm: quando, minutosNoLocal: minutos },
      });

      await registrarEvento({
        ordemServicoId: ordem.id,
        tipo: "SAIDA",
        descricao: `Saída detectada. Permanência no local: ${minutos} min.`,
        usuarioId: dados.usuarioId ?? null,
        ocorreuEm: quando,
      });

      resultado.saidas.push({
        ordemId: ordem.id,
        numero: ordem.numero,
        minutosNoLocal: minutos,
      });
    }
  }

  return resultado;
}

/**
 * A mesma avaliação, a partir do aparelho.
 *
 * O rastreador diz onde está o aparelho; quem é a pessoa depende do tipo. No
 * celular do técnico a posição já é dele; no carro, é de quem estiver com o
 * veículo agora. Aparelho de equipamento não responde por ninguém e sai daqui
 * sem fazer nada.
 */
export async function avaliarGeofenceDoRastreador(dados: {
  rastreadorId: string;
  latitude: number;
  longitude: number;
  capturadoEm?: Date;
}): Promise<ResultadoGeofence> {
  const rastreador = await prisma.rastreador.findUnique({
    where: { id: dados.rastreadorId },
    select: {
      tecnicoId: true,
      veiculo: { select: { tecnicoAtualId: true } },
    },
  });

  const tecnicoId = rastreador?.tecnicoId ?? rastreador?.veiculo?.tecnicoAtualId;
  if (!tecnicoId) return VAZIO;

  return avaliarGeofence({
    tecnicoId,
    latitude: dados.latitude,
    longitude: dados.longitude,
    capturadoEm: dados.capturadoEm,
    usuarioId: null,
  });
}

/**
 * 3.36 — fecha a permanência quando a OS é encerrada.
 *
 * Sem isto, uma OS concluída dentro do raio ficaria com a chegada aberta para
 * sempre: o técnico sai da rua, não há leitura de afastamento, e o tempo no
 * local nunca seria calculado.
 */
export async function fecharPermanencia(ordemId: string, quando = new Date()) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: ordemId },
    select: { chegadaEm: true, saidaEm: true },
  });

  if (!ordem?.chegadaEm || ordem.saidaEm) return null;

  const minutos = Math.max(
    0,
    Math.round((quando.getTime() - ordem.chegadaEm.getTime()) / 60_000),
  );

  await prisma.ordemServico.update({
    where: { id: ordemId },
    data: { saidaEm: quando, minutosNoLocal: minutos },
  });

  return minutos;
}

/** 3.36 — quanto tempo, em média, cada tipo de serviço consome no cliente. */
export async function tempoNoLocalPorTipo(dias = 30) {
  const desde = new Date(Date.now() - dias * 86_400_000);

  const ordens = await prisma.ordemServico.findMany({
    where: { minutosNoLocal: { not: null }, chegadaEm: { gte: desde } },
    select: { tipo: true, minutosNoLocal: true },
  });

  const porTipo = new Map<string, number[]>();
  for (const ordem of ordens) {
    const lista = porTipo.get(ordem.tipo) ?? [];
    lista.push(ordem.minutosNoLocal!);
    porTipo.set(ordem.tipo, lista);
  }

  return {
    medidas: ordens.length,
    porTipo: [...porTipo.entries()]
      .map(([tipo, valores]) => ({
        tipo,
        quantidade: valores.length,
        medioMinutos: Math.round(
          valores.reduce((s, v) => s + v, 0) / valores.length,
        ),
        maiorMinutos: Math.max(...valores),
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}
