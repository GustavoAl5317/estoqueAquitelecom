import { prisma } from "@/lib/prisma";
import { numero } from "@/lib/utils";

/**
 * 3.55 — PESOS DO SCORE OPERACIONAL.
 *
 * A recomendação de técnico não é uma caixa-preta: cada critério tem um peso
 * que o supervisor altera na Central de Controle e vê o resultado mudar na
 * mesma tela.
 */
export type Parametros = {
  pesoDistancia: number;
  pesoCarga: number;
  pesoMaterial: number;
  pesoRegiao: number;
  pesoDisponibilidade: number;
  /** minutos sem posição nova antes de considerar o rastreador mudo (3.8) */
  minutosPosicaoAtual: number;
  /** km a partir do qual o técnico é considerado distante da OS */
  raioAtuacaoKm: number;
  /** minutos parado com ignição desligada que levantam sinal (3.33) */
  minutosParadaSuspeita: number;
  /** 3.34 — raio em torno do endereço da OS que conta como "chegou" */
  raioChegadaMetros: number;
  /**
   * 3.35 — 1 move a OS para "em atendimento" ao detectar a chegada; 0 apenas
   * registra o fato. Começa em 0 de propósito: o sistema observa antes de
   * decidir pela pessoa.
   */
  moverAoChegar: number;
};

export const PARAMETROS_PADRAO: Parametros = {
  pesoDistancia: 30,
  pesoCarga: 20,
  pesoMaterial: 15,
  pesoRegiao: 10,
  pesoDisponibilidade: 25,
  minutosPosicaoAtual: 5,
  raioAtuacaoKm: 8,
  minutosParadaSuspeita: 40,
  raioChegadaMetros: 150,
  moverAoChegar: 0,
};

const PREFIXO = "operacao.";

export async function parametros(): Promise<Parametros> {
  const registros = await prisma.configuracao.findMany({
    where: { chave: { startsWith: PREFIXO } },
  });
  const mapa = Object.fromEntries(
    registros.map((r) => [r.chave.slice(PREFIXO.length), Number(r.valor)]),
  );
  return { ...PARAMETROS_PADRAO, ...mapa } as Parametros;
}

export async function salvarParametros(valores: Partial<Parametros>) {
  for (const [chave, valor] of Object.entries(valores)) {
    if (valor === undefined || Number.isNaN(valor)) continue;
    await prisma.configuracao.upsert({
      where: { chave: `${PREFIXO}${chave}` },
      create: {
        chave: `${PREFIXO}${chave}`,
        valor: String(valor),
        descricao: "Parâmetro de análise operacional",
      },
      update: { valor: String(valor) },
    });
  }
}

/** soma dos pesos, para mostrar se a configuração fecha em 100 */
export function somaDosPesos(p: Parametros) {
  return (
    p.pesoDistancia +
    p.pesoCarga +
    p.pesoMaterial +
    p.pesoRegiao +
    p.pesoDisponibilidade
  );
}

export type CandidatoScore = {
  tecnicoId: string;
  tecnicoNome: string;
  /** o que revelou a posição: a placa do carro ou o nome do aparelho */
  referencia: string;
  /** CELULAR | VEICULO — quanto confiar na coordenada */
  fonte: "CELULAR" | "VEICULO";
  distanciaKm: number;
  temMaterial: boolean;
  faltando: string[];
  osAbertas: number;
  disponivel: boolean;
  score: number;
  motivos: string[];
};

/**
 * 3.54 / 4.7 — score do técnico para um atendimento.
 * Cada critério vira uma nota de 0 a 1 multiplicada pelo seu peso, e os
 * motivos são explicitados para que a recomendação seja auditável.
 */
export function calcularScore(
  candidato: {
    tecnicoId: string;
    tecnicoNome: string;
    referencia: string;
    fonte: "CELULAR" | "VEICULO";
    distanciaKm: number;
    temMaterial: boolean;
    faltando: string[];
    osAbertas: number;
    mediaOsEquipe: number;
    naRegiao: boolean;
    disponivel: boolean;
  },
  p: Parametros,
): CandidatoScore {
  const motivos: string[] = [];

  // distância: nota 1 no raio de atuação, caindo até 0 ao dobro dele
  const limite = Math.max(p.raioAtuacaoKm * 2, 1);
  const notaDistancia = Math.max(0, 1 - candidato.distanciaKm / limite);
  if (candidato.distanciaKm <= p.raioAtuacaoKm) {
    motivos.push(
      `Está a ${numero(candidato.distanciaKm, 1)} km` +
        (candidato.fonte === "CELULAR" ? " (celular dele)" : " (pelo veículo)"),
    );
  }

  // carga: quem tem menos OS que a média pontua mais
  const referencia = Math.max(candidato.mediaOsEquipe, 1);
  const notaCarga = Math.max(0, Math.min(1, 1 - candidato.osAbertas / (referencia * 2)));
  if (candidato.osAbertas < candidato.mediaOsEquipe) {
    motivos.push(`Carga menor que a média (${candidato.osAbertas} OS)`);
  }

  const notaMaterial = candidato.temMaterial ? 1 : 0;
  if (candidato.temMaterial) motivos.push("Possui o material necessário");
  else motivos.push(`Falta ${candidato.faltando.join(", ")}`);

  const notaRegiao = candidato.naRegiao ? 1 : 0;
  if (candidato.naRegiao) motivos.push("Atua na região");

  const notaDisponibilidade = candidato.disponivel ? 1 : 0;
  if (candidato.disponivel) motivos.push("Está disponível");
  else motivos.push("Em atendimento");

  const total = somaDosPesos(p) || 1;
  const score =
    ((notaDistancia * p.pesoDistancia +
      notaCarga * p.pesoCarga +
      notaMaterial * p.pesoMaterial +
      notaRegiao * p.pesoRegiao +
      notaDisponibilidade * p.pesoDisponibilidade) /
      total) *
    100;

  return {
    tecnicoId: candidato.tecnicoId,
    tecnicoNome: candidato.tecnicoNome,
    referencia: candidato.referencia,
    fonte: candidato.fonte,
    distanciaKm: candidato.distanciaKm,
    temMaterial: candidato.temMaterial,
    faltando: candidato.faltando,
    osAbertas: candidato.osAbertas,
    disponivel: candidato.disponivel,
    score: Math.round(score),
    motivos,
  };
}
