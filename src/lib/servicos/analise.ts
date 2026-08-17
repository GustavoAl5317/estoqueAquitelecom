import { prisma } from "@/lib/prisma";
import { MOVIMENTOS_DE_CONSUMO } from "@/lib/dominio";
import { diasAtras, numero, percentual, quantidade } from "@/lib/utils";
import {
  consumoPorDetentor,
  limiares,
  saldosConsolidados,
} from "./consultas";
import { desviosDeConsumo, materiaisParados } from "./alertas";

/**
 * 1.31 / 1.33 — PREVISÃO DE ESTOQUE.
 *
 * ESTOQUE ATUAL → CONSUMO HISTÓRICO → MÉDIA DIÁRIA → TENDÊNCIA → PREVISÃO
 *
 * Toda a análise é local e determinística: nenhuma dependência externa. A
 * estrutura já entrega os números que uma camada de IA consumiria depois.
 */
export type Previsao = {
  materialId: string;
  nome: string;
  unidadeMedida: string;
  disponivel: number;
  consumoTotal: number;
  mediaDiaria: number;
  /** variação percentual entre a 2ª e a 1ª metade da janela analisada */
  tendencia: number;
  diasRestantes: number | null;
  /** quanto comprar para voltar ao nível ideal cobrindo a janela de reposição */
  sugestaoCompra: number;
  risco: "CRITICO" | "ATENCAO" | "NORMAL";
};

export async function previsaoDeEstoque(
  janelaDias = 30,
  horizonteDias = 30,
): Promise<Previsao[]> {
  const [consolidado, movimentos] = await Promise.all([
    saldosConsolidados(),
    prisma.movimento.findMany({
      where: {
        tipo: { in: MOVIMENTOS_DE_CONSUMO },
        criadoEm: { gte: diasAtras(janelaDias) },
      },
      select: { materialId: true, quantidade: true, criadoEm: true },
    }),
  ]);

  const metade = diasAtras(janelaDias / 2);
  const consumo = new Map<
    string,
    { total: number; primeiraMetade: number; segundaMetade: number }
  >();

  for (const m of movimentos) {
    const atual = consumo.get(m.materialId) ?? {
      total: 0,
      primeiraMetade: 0,
      segundaMetade: 0,
    };
    atual.total += m.quantidade;
    if (m.criadoEm >= metade) atual.segundaMetade += m.quantidade;
    else atual.primeiraMetade += m.quantidade;
    consumo.set(m.materialId, atual);
  }

  const previsoes: Previsao[] = [];

  for (const material of consolidado) {
    const dados = consumo.get(material.materialId);
    if (!dados || dados.total <= 0) continue;

    const mediaDiaria = dados.total / janelaDias;
    const tendencia =
      dados.primeiraMetade > 0
        ? ((dados.segundaMetade - dados.primeiraMetade) / dados.primeiraMetade) * 100
        : 0;

    // a média projetada acompanha a tendência recente, limitada a ±100%
    const fator = 1 + Math.max(-1, Math.min(1, tendencia / 100)) * 0.5;
    const mediaProjetada = mediaDiaria * fator;

    const diasRestantes =
      mediaProjetada > 0
        ? Math.floor(Math.max(material.disponivel, 0) / mediaProjetada)
        : null;

    const necessidade = mediaProjetada * horizonteDias;
    const alvo = Math.max(material.quantidadeIdeal, necessidade);
    const sugestaoCompra = Math.max(
      0,
      Math.ceil(alvo - Math.max(material.disponivel, 0)),
    );

    previsoes.push({
      materialId: material.materialId,
      nome: material.nome,
      unidadeMedida: material.unidadeMedida,
      disponivel: material.disponivel,
      consumoTotal: dados.total,
      mediaDiaria,
      tendencia,
      diasRestantes,
      sugestaoCompra,
      risco:
        diasRestantes === null
          ? "NORMAL"
          : diasRestantes <= 7
            ? "CRITICO"
            : diasRestantes <= 21
              ? "ATENCAO"
              : "NORMAL",
    });
  }

  return previsoes.sort(
    (a, b) => (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999),
  );
}

/**
 * 1.32 — DETECÇÃO DE ANOMALIAS.
 * Comparação de cada equipe/técnico contra a média dos demais. Sempre
 * apresentado como indicador operacional, nunca como conclusão.
 */
export type Anomalia = {
  id: string;
  titulo: string;
  detalhe: string;
  intensidade: number;
};

export async function anomalias(dias = 30): Promise<Anomalia[]> {
  const regras = await limiares();
  const resultado: Anomalia[] = [];

  for (const tipo of ["EQUIPE", "TECNICO"] as const) {
    const consumos = await consumoPorDetentor(dias, tipo);
    if (consumos.length < 3) continue;

    const media = consumos.reduce((s, c) => s + c.valor, 0) / consumos.length;
    if (media <= 0) continue;

    for (const consumo of consumos) {
      const variacao = ((consumo.valor - media) / media) * 100;
      if (variacao < regras.desvioConsumo) continue;
      resultado.push({
        id: `anomalia-${consumo.detentorId}`,
        titulo: `${consumo.nome} consumiu ${percentual(variacao)} acima da média`,
        detalhe:
          `Média dos demais no período: R$ ${numero(media, 2)}. ` +
          `Principais itens: ${consumo.materiais
            .slice(0, 3)
            .map((m) => `${m.nome} (${quantidade(m.quantidade, m.unidade)})`)
            .join(", ")}.`,
        intensidade: variacao,
      });
    }
  }

  for (const desvio of await desviosDeConsumo(regras.desvioConsumo)) {
    resultado.push({
      id: `desvio-${desvio.materialId}`,
      titulo: `Consumo de ${desvio.nome} subiu ${percentual(desvio.variacao)} em 30 dias`,
      detalhe: `De ${numero(desvio.anterior)} para ${numero(desvio.atual)} unidades no período equivalente.`,
      intensidade: desvio.variacao,
    });
  }

  for (const parado of (await materiaisParados(regras.diasMaterialParado)).slice(0, 8)) {
    resultado.push({
      id: `parado-${parado.detentorId}-${parado.materialId}`,
      titulo: `${parado.detentorNome} está com material parado há ${parado.dias} dias`,
      detalhe: `${quantidade(parado.quantidade, parado.unidade)} de ${parado.materialNome} sem movimentação.`,
      intensidade: parado.dias,
    });
  }

  return resultado.sort((a, b) => b.intensidade - a.intensidade);
}

/**
 * 1.31 — ANÁLISE DE ESTOQUE em texto corrido, no formato que a operação lê.
 * É a mesma leitura que uma camada de IA generativa produziria; aqui ela é
 * gerada de forma determinística a partir dos números reais.
 */
export async function analiseOperacional(): Promise<string[]> {
  const [consolidado, previsoes, listaAnomalias] = await Promise.all([
    saldosConsolidados(),
    previsaoDeEstoque(),
    anomalias(),
  ]);

  const linhas: string[] = [];

  const valorTotal = consolidado.reduce((s, m) => s + m.valorTotal, 0);
  const criticos = consolidado.filter(
    (m) => m.nivel === "CRITICO" || m.nivel === "SEM_ESTOQUE",
  );

  linhas.push(
    `O estoque soma R$ ${numero(valorTotal, 2)} distribuídos em ${consolidado.length} materiais ativos.`,
  );

  if (criticos.length) {
    linhas.push(
      `${criticos.length} material(is) estão em nível crítico ou zerados: ` +
        `${criticos.slice(0, 4).map((m) => m.nome).join(", ")}${criticos.length > 4 ? "…" : ""}.`,
    );
  } else {
    linhas.push("Nenhum material está em nível crítico no momento.");
  }

  const urgentes = previsoes.filter(
    (p) => p.diasRestantes !== null && p.diasRestantes <= 21,
  );
  for (const previsao of urgentes.slice(0, 3)) {
    const variacao =
      previsao.tendencia > 5
        ? ` O consumo aumentou ${percentual(previsao.tendencia)} na segunda metade do período.`
        : previsao.tendencia < -5
          ? ` O consumo caiu ${percentual(Math.abs(previsao.tendencia))} na segunda metade do período.`
          : "";
    linhas.push(
      `${previsao.nome}: consumo médio de ${quantidade(previsao.mediaDiaria, previsao.unidadeMedida)}/dia. ` +
        `Mantendo esse ritmo, o estoque atual dura aproximadamente ${previsao.diasRestantes} dias.` +
        variacao +
        (previsao.sugestaoCompra > 0
          ? ` Sugestão: repor ao menos ${quantidade(previsao.sugestaoCompra, previsao.unidadeMedida)}.`
          : ""),
    );
  }

  for (const anomalia of listaAnomalias.slice(0, 2)) {
    linhas.push(`${anomalia.titulo}. ${anomalia.detalhe}`);
  }

  linhas.push(
    "Estes números são indicadores operacionais e não conclusões automáticas de irregularidade.",
  );

  return linhas;
}
