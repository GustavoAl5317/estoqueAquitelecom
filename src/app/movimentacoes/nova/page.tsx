import { prisma } from "@/lib/prisma";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioMovimentacao } from "@/components/formulario-movimentacao";

export const dynamic = "force-dynamic";

export default async function NovaMovimentacao({
  searchParams,
}: {
  searchParams: Promise<{ origem?: string; tipo?: string }>;
}) {
  const { origem, tipo } = await searchParams;

  const [detentores, materiais, saldos, unidades, usuarios] = await Promise.all([
    prisma.detentor.findMany({
      include: { estoque: { select: { tipo: true } } },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    }),
    prisma.material.findMany({
      where: { status: "ATIVO" },
      orderBy: { nome: "asc" },
    }),
    prisma.saldo.findMany({ where: { quantidade: { gt: 0 } } }),
    prisma.unidadeSerial.findMany({
      where: { detentorId: { not: null } },
      select: {
        id: true,
        serial: true,
        materialId: true,
        detentorId: true,
        status: true,
        estadoFisico: true,
      },
      orderBy: { serial: "asc" },
    }),
    prisma.usuario.findMany({ where: { ativo: true }, orderBy: { nome: "asc" } }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Nova movimentação"
        descricao="Saída, transferência, devolução ou baixa. O material nunca desaparece — apenas muda de responsável."
      />
      <FormularioMovimentacao
        tipoInicial={tipo}
        origemInicial={origem}
        detentores={detentores.map((d) => ({
          id: d.id,
          nome: d.nome,
          tipo: d.tipo,
          tipoEstoque: d.estoque?.tipo ?? null,
        }))}
        materiais={materiais.map((m) => ({
          id: m.id,
          nome: m.nome,
          codigoInterno: m.codigoInterno,
          unidadeMedida: m.unidadeMedida,
          controle: m.controle,
        }))}
        saldos={saldos.map((s) => ({
          materialId: s.materialId,
          detentorId: s.detentorId,
          quantidade: s.quantidade,
          reservado: s.reservado,
        }))}
        unidades={unidades.map((u) => ({
          id: u.id,
          serial: u.serial,
          materialId: u.materialId,
          detentorId: u.detentorId!,
          status: u.status,
          estadoFisico: u.estadoFisico,
        }))}
        usuarios={usuarios.map((u) => ({ id: u.id, nome: u.nome }))}
      />
    </div>
  );
}
