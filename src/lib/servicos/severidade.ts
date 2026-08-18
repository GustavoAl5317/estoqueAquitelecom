import { prisma } from "@/lib/prisma";
import {
  ESCALA_SEVERIDADE,
  SEVERIDADE_PADRAO_POR_TIPO,
  TIPO_OS,
} from "@/lib/dominio";
import { situacaoSla } from "./ordens";
import { registrarEvento } from "./eventos";

/**
 * 2.8 / 2.9 — SEVERIDADE.
 *
 * A severidade que a OS carrega no cadastro é o ponto de partida, não a
 * verdade final. Uma OS de "sem conexão" nasce alta; a mesma OS parada há seis
 * horas com o prazo estourado é outra coisa, e o quadro tem de dizer isso sem
 * depender de alguém reparar.
 *
 * Duas regras que valem registro:
 *
 * 1. **A severidade só sobe.** Nunca rebaixamos automaticamente: se alguém
 *    marcou como crítica na mão, o sistema não tem informação suficiente para
 *    discordar. Elevar é acrescentar contexto; rebaixar é apagar julgamento.
 *
 * 2. **A elevação é calculada, não gravada.** O valor original permanece no
 *    banco e a tela mostra os dois — o que foi cadastrado e o que a situação
 *    exige. Sobrescrever faria a OS parecer ter nascido crítica.
 */

const PREFIXO = "severidade.";

export type MatrizSeveridade = Record<string, string>;

/** 2.8 — a matriz vigente: padrão de fábrica sobrescrito pela configuração. */
export async function matrizDeSeveridade(): Promise<MatrizSeveridade> {
  const registros = await prisma.configuracao.findMany({
    where: { chave: { startsWith: PREFIXO } },
  });

  const salvos = Object.fromEntries(
    registros.map((r) => [r.chave.slice(PREFIXO.length), r.valor]),
  );

  return { ...SEVERIDADE_PADRAO_POR_TIPO, ...salvos };
}

export async function salvarMatrizDeSeveridade(valores: MatrizSeveridade) {
  for (const [tipo, severidade] of Object.entries(valores)) {
    if (!TIPO_OS.inclui(tipo) || !ESCALA_SEVERIDADE.includes(severidade)) continue;
    await prisma.configuracao.upsert({
      where: { chave: `${PREFIXO}${tipo}` },
      create: {
        chave: `${PREFIXO}${tipo}`,
        valor: severidade,
        descricao: `Severidade inicial de OS do tipo ${TIPO_OS.rotulo(tipo)}`,
      },
      update: { valor: severidade },
    });
  }
}

function maisGrave(a: string, b: string) {
  return ESCALA_SEVERIDADE.indexOf(a) >= ESCALA_SEVERIDADE.indexOf(b) ? a : b;
}

function elevar(atual: string, passos: number) {
  const indice = Math.min(
    ESCALA_SEVERIDADE.length - 1,
    ESCALA_SEVERIDADE.indexOf(atual) + passos,
  );
  return ESCALA_SEVERIDADE[indice];
}

export type SeveridadeEfetiva = {
  cadastrada: string;
  efetiva: string;
  elevada: boolean;
  motivos: string[];
};

/**
 * 2.9 — a severidade que a operação deve enxergar agora.
 *
 * `vizinhas` é a quantidade de OS abertas do mesmo tipo no mesmo bairro: cinco
 * clientes sem conexão na mesma rua não são cinco problemas, é um.
 */
export function severidadeEfetiva(
  ordem: {
    severidade: string;
    prazo: Date | null;
    concluidaEm: Date | null;
    status: string;
    abertaEm: Date;
    tecnicoId?: string | null;
  },
  contexto: { vizinhas?: number; reincidencias?: number } = {},
): SeveridadeEfetiva {
  const cadastrada = ordem.severidade;
  let efetiva = cadastrada;
  const motivos: string[] = [];

  const { situacao } = situacaoSla(ordem);

  if (situacao === "ESTOURADO") {
    efetiva = maisGrave(efetiva, elevar(efetiva, 2));
    motivos.push("Prazo estourado");
  } else if (situacao === "ATENCAO") {
    efetiva = maisGrave(efetiva, elevar(efetiva, 1));
    motivos.push("Menos de uma hora de prazo");
  }

  // 2.27 — concentração vira severidade: pode ser um problema só, maior
  if ((contexto.vizinhas ?? 0) >= 5) {
    efetiva = maisGrave(efetiva, "CRITICA");
    motivos.push(`${contexto.vizinhas} OS iguais no mesmo bairro`);
  } else if ((contexto.vizinhas ?? 0) >= 3) {
    efetiva = maisGrave(efetiva, elevar(efetiva, 1));
    motivos.push(`${contexto.vizinhas} OS iguais no mesmo bairro`);
  }

  // 2.25 — cliente que volta é cliente cujo problema não foi resolvido
  if ((contexto.reincidencias ?? 0) >= 3) {
    efetiva = maisGrave(efetiva, elevar(efetiva, 1));
    motivos.push(`Cliente com ${contexto.reincidencias} OS em 30 dias`);
  }

  // uma OS sem dono há muito tempo é um esquecimento, não uma prioridade baixa
  const horasSemDono = (Date.now() - ordem.abertaEm.getTime()) / 3_600_000;
  if (!ordem.tecnicoId && horasSemDono >= 24) {
    efetiva = maisGrave(efetiva, elevar(efetiva, 1));
    motivos.push(`Sem responsável há ${Math.floor(horasSemDono)} h`);
  }

  return { cadastrada, efetiva, elevada: efetiva !== cadastrada, motivos };
}

/**
 * Aplica a matriz a uma OS que chegou sem severidade definida — o caso das que
 * vêm do SGP, onde esse campo raramente existe.
 */
export async function severidadeInicial(tipo: string) {
  const matriz = await matrizDeSeveridade();
  return matriz[tipo] ?? "MEDIA";
}

/**
 * Grava a elevação como evento quando ela cruza para crítica. Não altera o
 * campo: registra que a operação passou a tratar aquilo como crítico, e quando.
 */
export async function anotarElevacao(
  ordemServicoId: string,
  resultado: SeveridadeEfetiva,
) {
  if (!resultado.elevada || resultado.efetiva !== "CRITICA") return;

  const jaAnotado = await prisma.eventoOS.findFirst({
    where: { ordemServicoId, tipo: "SEVERIDADE", descricao: { contains: "crítica" } },
  });
  if (jaAnotado) return;

  await registrarEvento({
    ordemServicoId,
    tipo: "SEVERIDADE",
    descricao: `Severidade tratada como crítica: ${resultado.motivos.join("; ")}.`,
  });
}
