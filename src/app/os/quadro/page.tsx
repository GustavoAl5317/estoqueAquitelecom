import Link from "next/link";
import { List, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { prazoLegivel, quadroDeOrdens } from "@/lib/servicos/ordens";
import { numero } from "@/lib/utils";
import { BotaoLink, CabecalhoPagina, Cartao } from "@/components/ui";
import { QuadroOS } from "@/components/quadro-os";

export const dynamic = "force-dynamic";

/**
 * 2.20 — QUADRO OPERACIONAL.
 *
 * A tela em que o supervisor passa o dia. Cada cartão é uma OS; arrastar entre
 * as colunas muda o status e assina a auditoria.
 */
export default async function QuadroDeOrdens({
  searchParams,
}: {
  searchParams: Promise<{ tecnicoId?: string; prioridade?: string }>;
}) {
  const filtros = await searchParams;

  const [colunas, tecnicos] = await Promise.all([
    quadroDeOrdens({
      tecnicoId: filtros.tecnicoId,
      prioridade: filtros.prioridade,
    }),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
  ]);

  // o número que importa é o trabalho em aberto; concluída é resultado, não fila
  const emAberto = colunas
    .filter((c) => c.status !== "CONCLUIDA")
    .reduce((s, c) => s + c.total, 0);
  const emRisco = colunas.reduce((s, c) => s + c.emRisco, 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Quadro de ordens"
        descricao={`${numero(emAberto)} OS em aberto${emRisco ? ` · ${emRisco} em risco de prazo` : ""}. Arraste um cartão para mudar a situação; concluídas ficam 24 h no quadro.`}
        acoes={
          <>
            <BotaoLink href="/os">
              <List className="size-4" aria-hidden /> Lista
            </BotaoLink>
            <BotaoLink href="/os/nova" variante="primario">
              <Plus className="size-4" aria-hidden /> Nova OS
            </BotaoLink>
          </>
        }
      />

      <Cartao className="mb-4">
        <form className="flex flex-wrap items-center gap-2">
          <select name="tecnicoId" defaultValue={filtros.tecnicoId ?? ""}>
            <option value="">Todos os técnicos</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nome}
              </option>
            ))}
          </select>
          <select name="prioridade" defaultValue={filtros.prioridade ?? ""}>
            <option value="">Todas as prioridades</option>
            <option value="P1">P1 — Emergencial</option>
            <option value="P2">P2 — Alta</option>
            <option value="P3">P3 — Normal</option>
            <option value="P4">P4 — Baixa</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-[var(--acento)] px-3 py-1.5 text-sm font-medium text-white"
          >
            Filtrar
          </button>
          {(filtros.tecnicoId || filtros.prioridade) && (
            <Link
              href="/os/quadro"
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
            >
              Limpar
            </Link>
          )}
        </form>
      </Cartao>

      <QuadroOS
        tecnicos={tecnicos}
        colunas={colunas.map((coluna) => ({
          status: coluna.status,
          rotulo: coluna.rotulo,
          total: coluna.total,
          ocultas: coluna.ocultas,
          emRisco: coluna.emRisco,
          cartoes: coluna.cartoes.map((ordem) => ({
            id: ordem.id,
            numero: ordem.numero,
            cliente: ordem.cliente,
            endereco: ordem.endereco,
            bairro: ordem.bairro?.nome ?? ordem.bairroNome,
            tipo: ordem.tipo,
            prioridade: ordem.prioridade,
            status: ordem.status,
            tecnicoId: ordem.tecnicoId,
            tecnicoNome: ordem.tecnico?.nome ?? null,
            situacao: ordem.situacao,
            prazoTexto:
              ordem.situacao === "SEM_PRAZO"
                ? "sem prazo"
                : prazoLegivel(ordem.minutosRestantes),
            materiais: ordem._count.movimentacoes,
          })),
        }))}
      />
    </>
  );
}
