import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioMaterial } from "@/components/formulario-material";

export default async function EditarMaterial({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [material, categorias, temMovimento] = await Promise.all([
    prisma.material.findUnique({ where: { id } }),
    prisma.categoria.findMany({ where: { ativa: true }, orderBy: { ordem: "asc" } }),
    prisma.movimento.findFirst({ where: { materialId: id }, select: { id: true } }),
  ]);

  if (!material) notFound();

  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina titulo="Editar material" descricao={material.nome} />
      <FormularioMaterial
        categorias={categorias}
        material={material}
        bloquearControle={Boolean(temMovimento)}
      />
    </div>
  );
}
