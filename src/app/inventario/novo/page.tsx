import { prisma } from "@/lib/prisma";
import { TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { CabecalhoPagina, Cartao } from "@/components/ui";
import { FormularioNovoInventario } from "@/components/formulario-inventario";

export const dynamic = "force-dynamic";

export default async function NovoInventario({
  searchParams,
}: {
  searchParams: Promise<{ detentor?: string }>;
}) {
  const { detentor } = await searchParams;

  const detentores = await prisma.detentor.findMany({
    where: {
      OR: [
        { estoque: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA } } },
        { tipo: { in: ["TECNICO", "EQUIPE"] } },
      ],
    },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });

  return (
    <div className="mx-auto max-w-lg">
      <CabecalhoPagina
        titulo="Iniciar inventário"
        descricao="O saldo do sistema é congelado no momento da abertura, para que a comparação seja justa mesmo com movimentações em paralelo."
      />
      <Cartao>
        <FormularioNovoInventario
          detentorInicial={detentor}
          detentores={detentores.map((d) => ({ id: d.id, nome: d.nome }))}
        />
      </Cartao>
    </div>
  );
}
