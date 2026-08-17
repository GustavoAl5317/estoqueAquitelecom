import { prisma } from "@/lib/prisma";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioMaterial } from "@/components/formulario-material";

export default async function NovoMaterial() {
  const categorias = await prisma.categoria.findMany({
    where: { ativa: true },
    orderBy: { ordem: "asc" },
  });

  return (
    <div className="mx-auto max-w-4xl">
      <CabecalhoPagina
        titulo="Novo material"
        descricao="Cadastro padronizado — a estrutura aceita novas categorias sem alteração no sistema."
      />
      <FormularioMaterial categorias={categorias} />
    </div>
  );
}
