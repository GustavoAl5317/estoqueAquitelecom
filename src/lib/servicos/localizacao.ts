import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar } from "./nucleo";
import { distanciaKm } from "./frota";

/**
 * 3.4 / 3.5 — LOCALIZAÇÃO PELO NAVEGADOR.
 *
 * O técnico não instala nada: quando ele abre a própria tela e autoriza, o
 * navegador entrega a coordenada e ela chega aqui. É a fonte mais direta que
 * existe — mais direta até que o celular rastreado, porque depende de um
 * consentimento explícito e visível.
 *
 * Duas regras que o escopo pede e que estão implementadas aqui:
 *
 * 1. **Fora da jornada não se grava posição.** Rastrear alguém fora do horário
 *    de trabalho não é controle operacional; é outra coisa.
 * 2. **Precisão ruim entra marcada.** Uma leitura com 2 km de incerteza não
 *    pode ser tratada igual a uma com 10 metros, ou a distância calculada vira
 *    ficção.
 */

/** acima disto a leitura é imprecisa demais para decidir alocação */
const METROS_PRECISAO_UTIL = 200;

export async function registrarLocalizacaoTecnico(dados: {
  tecnicoId: string;
  latitude: number;
  longitude: number;
  precisao?: number | null;
  origem?: string;
}) {
  if (
    !Number.isFinite(dados.latitude) ||
    !Number.isFinite(dados.longitude) ||
    Math.abs(dados.latitude) > 90 ||
    Math.abs(dados.longitude) > 180
  ) {
    throw new ErroDeNegocio("Coordenada inválida.");
  }

  const tecnico = await prisma.tecnico.findUnique({
    where: { id: dados.tecnicoId },
  });
  if (!tecnico) throw new ErroDeNegocio("Técnico não encontrado.");

  // 3.5 — jornada encerrada, rastreamento encerrado
  if (tecnico.status === "FORA_JORNADA") {
    throw new ErroDeNegocio(
      "Sua jornada está encerrada. Inicie a jornada para voltar a reportar posição.",
    );
  }

  return prisma.localizacaoTecnico.create({
    data: {
      tecnicoId: dados.tecnicoId,
      latitude: dados.latitude,
      longitude: dados.longitude,
      precisao: dados.precisao ?? null,
      statusOperacional: tecnico.status,
      origem: dados.origem ?? "NAVEGADOR",
    },
  });
}

/** 3.5 — abrir e fechar a jornada, que é o que liga e desliga o rastreamento. */
export async function alternarJornada(
  tecnicoId: string,
  emJornada: boolean,
  usuarioId: string,
) {
  const tecnico = await prisma.tecnico.findUnique({ where: { id: tecnicoId } });
  if (!tecnico) throw new ErroDeNegocio("Técnico não encontrado.");

  const status = emJornada ? "DISPONIVEL" : "FORA_JORNADA";
  const atualizado = await prisma.tecnico.update({
    where: { id: tecnicoId },
    data: { status },
  });

  await auditar(prisma, {
    entidade: "Tecnico",
    entidadeId: tecnicoId,
    acao: "EDICAO",
    descricao: `${tecnico.nome} ${emJornada ? "iniciou" : "encerrou"} a jornada.`,
    usuarioId,
    antes: { status: tecnico.status },
    depois: { status },
  });

  return atualizado;
}

export type LocalizacaoDoNavegador = {
  tecnicoId: string;
  latitude: number;
  longitude: number;
  precisao: number | null;
  capturadoEm: Date;
  atrasoMinutos: number;
  /** a leitura é boa o bastante para medir distância? */
  confiavel: boolean;
};

/** A última posição informada pelo navegador de cada técnico em jornada. */
export async function localizacoesDoNavegador(): Promise<
  LocalizacaoDoNavegador[]
> {
  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true, status: { not: "FORA_JORNADA" } },
    select: {
      id: true,
      localizacoes: {
        orderBy: { capturadoEm: "desc" },
        take: 1,
      },
    },
  });

  return tecnicos
    .filter((t) => t.localizacoes.length > 0)
    .map((t) => {
      const ultima = t.localizacoes[0];
      return {
        tecnicoId: t.id,
        latitude: ultima.latitude,
        longitude: ultima.longitude,
        precisao: ultima.precisao,
        capturadoEm: ultima.capturadoEm,
        atrasoMinutos: Math.floor(
          (Date.now() - ultima.capturadoEm.getTime()) / 60_000,
        ),
        confiavel:
          ultima.precisao === null || ultima.precisao <= METROS_PRECISAO_UTIL,
      };
    });
}

/**
 * 3.11 / 3.12 — quanto o técnico andou e quanto tempo passou em deslocamento.
 *
 * A soma dos trechos entre leituras consecutivas subestima a distância real —
 * o carro não anda em linha reta entre dois pontos. É uma medida de esforço
 * comparável entre técnicos, não um número para reembolso de combustível, e a
 * tela precisa dizer isso.
 */
export async function deslocamentoDoTecnico(
  tecnicoId: string,
  desde = new Date(new Date().setHours(0, 0, 0, 0)),
) {
  const pontos = await prisma.localizacaoTecnico.findMany({
    where: { tecnicoId, capturadoEm: { gte: desde } },
    orderBy: { capturadoEm: "asc" },
  });

  let km = 0;
  let minutosEmMovimento = 0;

  for (let i = 1; i < pontos.length; i++) {
    const anterior = pontos[i - 1];
    const atual = pontos[i];
    const trecho = distanciaKm(anterior, atual);
    const minutos =
      (atual.capturadoEm.getTime() - anterior.capturadoEm.getTime()) / 60_000;

    // salto grande com intervalo longo é perda de sinal, não viagem
    if (minutos > 45 && trecho > 5) continue;

    km += trecho;
    // parado é qualquer trecho abaixo de 80 m entre leituras
    if (trecho > 0.08) minutosEmMovimento += minutos;
  }

  return {
    leituras: pontos.length,
    km: Number(km.toFixed(2)),
    minutosEmMovimento: Math.round(minutosEmMovimento),
    primeira: pontos[0]?.capturadoEm ?? null,
    ultima: pontos.at(-1)?.capturadoEm ?? null,
  };
}
