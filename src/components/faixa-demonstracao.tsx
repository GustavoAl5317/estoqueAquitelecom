import { FlaskConical } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { data } from "@/lib/utils";

/**
 * A base populada pelo seed mostra R$ 106 mil em estoque com a mesma cara de um
 * número real. Sem um aviso permanente na tela, alguém apresenta isso ao
 * cliente como se fosse a operação dele — e descobre tarde.
 *
 * A faixa some sozinha: `db:limpar` não recria a marca, então a primeira base
 * de verdade já nasce sem ela.
 */
export async function FaixaDemonstracao() {
  const marca = await prisma.configuracao
    .findUnique({ where: { chave: "sistema.baseDeDemonstracao" } })
    .catch(() => null);

  if (!marca) return null;

  const gerada = new Date(marca.valor);

  return (
    <div
      className="sem-impressao flex flex-wrap items-center gap-x-2 gap-y-0.5 px-4 py-1.5 text-[11px] font-medium"
      style={{ background: "var(--atencao-suave)", color: "var(--atencao)" }}
      role="status"
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <strong>Base de demonstração.</strong>
      <span className="text-[var(--texto-2)]">
        Materiais, ordens, clientes e valores desta tela são fictícios — não
        representam a operação.
      </span>
      <span className="ml-auto text-[var(--texto-3)]">
        gerada em {data(gerada)} · <code className="font-mono">npm run db:limpar</code>{" "}
        para começar com dados reais
      </span>
    </div>
  );
}
