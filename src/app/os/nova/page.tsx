import { prisma } from "@/lib/prisma";
import { CabecalhoPagina } from "@/components/ui";
import { FormularioOS } from "@/components/formulario-os";

export const dynamic = "force-dynamic";

export default async function NovaOrdem() {
  const [bairros, tecnicos] = await Promise.all([
    prisma.bairro.findMany({
      select: { id: true, nome: true, cidade: true },
      orderBy: { nome: "asc" },
    }),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Nova ordem de serviço"
        descricao="Para o que não veio do SGP: chamado por telefone, visita agendada no balcão, manutenção preventiva."
      />
      <FormularioOS bairros={bairros} tecnicos={tecnicos} />
    </>
  );
}
