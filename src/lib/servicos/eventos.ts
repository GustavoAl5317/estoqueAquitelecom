import { prisma } from "@/lib/prisma";
import { STATUS_OS } from "@/lib/dominio";
import type { Tx } from "./nucleo";

/**
 * 2.33 / 2.41 — TIMELINE DA ORDEM DE SERVIÇO.
 *
 * A auditoria responde "quem mexeu"; a timeline responde "o que aconteceu com
 * o atendimento". São perguntas diferentes, e misturá-las produz um registro
 * que não serve bem a nenhuma das duas: a auditoria precisa de valor anterior
 * e novo, a timeline precisa de uma linha por etapa para que se possa medir
 * quanto tempo cada uma levou.
 */

export async function registrarEvento(
  dados: {
    ordemServicoId: string;
    tipo: string;
    descricao: string;
    status?: string | null;
    usuarioId?: string | null;
    ocorreuEm?: Date;
  },
  tx: Tx = prisma,
) {
  return tx.eventoOS.create({
    data: {
      ordemServicoId: dados.ordemServicoId,
      tipo: dados.tipo,
      descricao: dados.descricao,
      status: dados.status ?? null,
      usuarioId: dados.usuarioId ?? null,
      ocorreuEm: dados.ocorreuEm ?? new Date(),
    },
  });
}

export async function timelineDaOrdem(ordemServicoId: string) {
  return prisma.eventoOS.findMany({
    where: { ordemServicoId },
    include: { usuario: { select: { nome: true } } },
    orderBy: { ocorreuEm: "asc" },
  });
}

export type TemposDaOrdem = {
  ateAtribuicao: number | null;
  emDeslocamento: number | null;
  emAtendimento: number | null;
  total: number | null;
};

/**
 * 2.41 — quanto tempo cada etapa levou, em minutos.
 *
 * Devolve `null` para a etapa que não aconteceu, em vez de zero: uma OS que
 * nunca passou por deslocamento não gastou zero minuto deslocando-se, ela
 * simplesmente não tem esse dado — e zerar distorceria qualquer média.
 */
export function temposDaOrdem(
  ordem: { abertaEm: Date; concluidaEm: Date | null },
  eventos: { tipo: string; status: string | null; ocorreuEm: Date }[],
): TemposDaOrdem {
  const primeiro = (status: string) =>
    eventos.find((e) => e.status === status)?.ocorreuEm ?? null;

  const atribuida =
    eventos.find((e) => e.tipo === "ATRIBUIDA")?.ocorreuEm ??
    primeiro("ATRIBUIDA");
  const deslocamento = primeiro("EM_DESLOCAMENTO");
  const atendimento = primeiro("EM_ATENDIMENTO");

  const minutos = (de: Date | null, ate: Date | null) =>
    de && ate ? Math.max(0, Math.round((ate.getTime() - de.getTime()) / 60_000)) : null;

  return {
    ateAtribuicao: minutos(ordem.abertaEm, atribuida),
    emDeslocamento: minutos(deslocamento, atendimento),
    emAtendimento: minutos(atendimento, ordem.concluidaEm),
    total: minutos(ordem.abertaEm, ordem.concluidaEm),
  };
}

/** 2.41 — médias da operação, por etapa, no período. */
export async function temposMedios(dias = 30) {
  const desde = new Date(Date.now() - dias * 86_400_000);

  const ordens = await prisma.ordemServico.findMany({
    where: { concluidaEm: { gte: desde } },
    select: {
      id: true,
      abertaEm: true,
      concluidaEm: true,
      tipo: true,
      eventos: {
        select: { tipo: true, status: true, ocorreuEm: true },
        orderBy: { ocorreuEm: "asc" },
      },
    },
  });

  const medir = (valores: (number | null)[]) => {
    const validos = valores.filter((v): v is number => v !== null);
    return validos.length
      ? Math.round(validos.reduce((s, v) => s + v, 0) / validos.length)
      : null;
  };

  const tempos = ordens.map((o) => temposDaOrdem(o, o.eventos));

  const porTipo = new Map<string, TemposDaOrdem[]>();
  ordens.forEach((ordem, i) => {
    const lista = porTipo.get(ordem.tipo) ?? [];
    lista.push(tempos[i]);
    porTipo.set(ordem.tipo, lista);
  });

  return {
    concluidas: ordens.length,
    ateAtribuicao: medir(tempos.map((t) => t.ateAtribuicao)),
    emDeslocamento: medir(tempos.map((t) => t.emDeslocamento)),
    emAtendimento: medir(tempos.map((t) => t.emAtendimento)),
    total: medir(tempos.map((t) => t.total)),
    porTipo: [...porTipo.entries()]
      .map(([tipo, lista]) => ({
        tipo,
        quantidade: lista.length,
        ateAtribuicao: medir(lista.map((t) => t.ateAtribuicao)),
        emDeslocamento: medir(lista.map((t) => t.emDeslocamento)),
        emAtendimento: medir(lista.map((t) => t.emAtendimento)),
        total: medir(lista.map((t) => t.total)),
      }))
      .sort((a, b) => b.quantidade - a.quantidade),
  };
}

/** "1h 20min" — o formato que cabe numa célula de tabela */
export function minutosLegiveis(minutos: number | null) {
  if (minutos === null) return "—";
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (!horas) return `${resto}min`;
  return resto ? `${horas}h ${resto}min` : `${horas}h`;
}

/** rótulo curto para a linha da timeline */
export function descricaoDoStatus(status: string | null) {
  return status ? STATUS_OS.rotulo(status) : null;
}
