import { prisma } from "@/lib/prisma";
import { TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioEntrada } from "@/components/formulario-entrada";

export const dynamic = "force-dynamic";

export default async function NovaEntrada() {
  const [materiais, detentores, fornecedores] = await Promise.all([
    prisma.material.findMany({
      where: { status: "ATIVO" },
      include: { categoria: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    }),
    prisma.detentor.findMany({
      include: { estoque: true },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    }),
    prisma.fornecedor.findMany({ orderBy: { nome: "asc" } }),
  ]);

  const destinos = detentores.filter(
    (d) => !d.estoque || !TIPOS_ESTOQUE_SISTEMA.includes(d.estoque.tipo),
  );

  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Nova entrada"
        descricao="A entrada é registrada como aguardando recebimento. O material só entra no saldo depois da conferência física."
      />
      <FormularioEntrada
        materiais={materiais.map((m) => ({
          id: m.id,
          nome: m.nome,
          codigoInterno: m.codigoInterno,
          unidadeMedida: m.unidadeMedida,
          controle: m.controle,
          valorMedio: m.valorMedio,
          categoria: m.categoria.nome,
        }))}
        destinos={destinos.map((d) => ({ id: d.id, nome: d.nome, tipo: d.tipo }))}
        fornecedores={fornecedores.map((f) => ({ id: f.id, nome: f.nome }))}
      />
    </div>
  );
}
