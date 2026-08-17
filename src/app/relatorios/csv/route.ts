import { montarCsv, relatorioPorId } from "@/lib/servicos/relatorios";

/** 1.30 — exportação em CSV, pronta para abrir no Excel em português. */
export async function GET(requisicao: Request) {
  const parametros = new URL(requisicao.url).searchParams;
  const relatorio = relatorioPorId(parametros.get("r") ?? "");

  if (!relatorio) {
    return new Response("Relatório não encontrado.", { status: 404 });
  }

  const dias = Number(parametros.get("dias")) || 30;
  const { colunas, linhas } = await relatorio.carregar(dias);
  const csv = montarCsv(colunas, linhas);

  const data = new Date().toISOString().slice(0, 10);
  const arquivo = `${relatorio.id}-${data}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
