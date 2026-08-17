import { prisma } from "../src/lib/prisma";
import {
  resumoDashboard,
  saldosConsolidados,
  consumoPorMaterial,
  consumoPorDetentor,
  movimentacaoPorPeriodo,
} from "../src/lib/servicos/consultas";
import { alertasDoEstoque } from "../src/lib/servicos/alertas";
import { analiseOperacional, previsaoDeEstoque } from "../src/lib/servicos/analise";

async function main() {
  const resumo = await resumoDashboard();
  console.log("RESUMO", resumo);

  const consolidado = await saldosConsolidados();
  console.table(
    consolidado.slice(0, 8).map((m) => ({
      nome: m.nome,
      estoque: m.emEstoque,
      tecnicos: m.emPosseTecnicos,
      reservado: m.reservado,
      disponivel: m.disponivel,
      nivel: m.nivel,
    })),
  );

  console.log("\nCONSUMO POR MATERIAL (30d)");
  console.table(await consumoPorMaterial(30, 6));

  console.log("\nCONSUMO POR TECNICO (30d)");
  console.table(
    (await consumoPorDetentor(30, "TECNICO")).map((t) => ({
      nome: t.nome,
      valor: t.valor.toFixed(2),
      total: t.total,
    })),
  );

  const serie = await movimentacaoPorPeriodo(30);
  console.log("\nSERIE 30d — amostra", serie.slice(-5));

  const alertas = await alertasDoEstoque();
  console.log(`\nALERTAS: ${alertas.length}`);
  alertas.slice(0, 6).forEach((a) => console.log(` [${a.severidade}] ${a.titulo}`));

  const previsoes = await previsaoDeEstoque();
  console.log("\nPREVISAO");
  console.table(
    previsoes.slice(0, 6).map((p) => ({
      nome: p.nome,
      disponivel: p.disponivel,
      mediaDiaria: p.mediaDiaria.toFixed(2),
      dias: p.diasRestantes,
      compra: p.sugestaoCompra,
      risco: p.risco,
    })),
  );

  console.log("\nANALISE");
  (await analiseOperacional()).forEach((l) => console.log(" -", l));

  // consistência: saldo x razão de movimentos
  const saldos = await prisma.saldo.findMany();
  let inconsistentes = 0;
  for (const saldo of saldos) {
    const entradas = await prisma.movimento.aggregate({
      where: { materialId: saldo.materialId, destinoId: saldo.detentorId },
      _sum: { quantidade: true },
    });
    const saidas = await prisma.movimento.aggregate({
      where: {
        materialId: saldo.materialId,
        origemId: saldo.detentorId,
        tipo: { notIn: ["RESERVA", "LIBERACAO_RESERVA"] },
      },
      _sum: { quantidade: true },
    });
    const esperado =
      (entradas._sum.quantidade ?? 0) - (saidas._sum.quantidade ?? 0);
    if (Math.abs(esperado - saldo.quantidade) > 0.001) {
      inconsistentes++;
      console.log("DIVERGENCIA", saldo.materialId, saldo.detentorId, esperado, saldo.quantidade);
    }
  }
  console.log(`\nConsistência saldo x razão: ${saldos.length - inconsistentes}/${saldos.length} corretos`);
}

main().finally(() => prisma.$disconnect());
