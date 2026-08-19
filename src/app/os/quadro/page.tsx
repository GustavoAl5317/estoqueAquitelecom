import Link from "next/link";
import { List, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  prazoLegivel,
  quadroPorRecorte,
  type RecorteQuadro,
} from "@/lib/servicos/ordens";
import { visoesParaTela } from "@/lib/servicos/visoes";
import { usuarioAtual } from "@/lib/sessao";
import { numero, queryDeFiltros } from "@/lib/utils";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Vazio,
} from "@/components/ui";
import { QuadroOS, type ColunaOS } from "@/components/quadro-os";
import { VisoesSalvas } from "@/components/visoes-salvas";

export const dynamic = "force-dynamic";

const RECORTES: { valor: RecorteQuadro; rotulo: string }[] = [
  { valor: "STATUS", rotulo: "Quadro único" },
  { valor: "TECNICO", rotulo: "Por técnico" },
  { valor: "EQUIPE", rotulo: "Por equipe" },
  { valor: "BAIRRO", rotulo: "Por bairro" },
];

/**
 * 2.20 / 3.25–3.27 — QUADRO OPERACIONAL.
 *
 * A tela em que o supervisor passa o dia. Cada cartão é uma OS; arrastar entre
 * as colunas muda o status e assina a auditoria.
 *
 * O recorte quebra o mesmo quadro em faixas — uma por técnico, equipe ou
 * bairro. É a diferença entre saber quantas OS estão em atendimento e saber
 * quem está com dez delas enquanto o colega ao lado está com duas.
 */
export default async function QuadroDeOrdens({
  searchParams,
}: {
  searchParams: Promise<{
    tecnicoId?: string;
    prioridade?: string;
    recorte?: string;
  }>;
}) {
  const filtros = await searchParams;
  const recorte = (RECORTES.find((r) => r.valor === filtros.recorte)?.valor ??
    "STATUS") as RecorteQuadro;

  const usuario = await usuarioAtual();

  const [faixas, tecnicos, visoes] = await Promise.all([
    quadroPorRecorte(
      { tecnicoId: filtros.tecnicoId, prioridade: filtros.prioridade },
      recorte,
    ),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    visoesParaTela("/os/quadro", usuario.id),
  ]);

  // o número que importa é o trabalho em aberto; concluída é resultado, não fila
  const emAberto = faixas.reduce(
    (soma, faixa) =>
      soma +
      faixa.colunas
        .filter((c) => c.status !== "CONCLUIDA")
        .reduce((s, c) => s + c.total, 0),
    0,
  );
  const emRisco = faixas.reduce((soma, faixa) => soma + faixa.emRisco, 0);

  const paraComponente = (colunas: (typeof faixas)[number]["colunas"]): ColunaOS[] =>
    colunas.map((coluna) => ({
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
    }));

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
          <select name="recorte" defaultValue={recorte}>
            {RECORTES.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
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
          {(filtros.tecnicoId || filtros.prioridade || filtros.recorte) && (
            <Link
              href="/os/quadro"
              className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
            >
              Limpar
            </Link>
          )}
        </form>

        <div className="mt-3 border-t border-[var(--borda)] pt-3">
          <VisoesSalvas
            tela="/os/quadro"
            filtrosAtuais={queryDeFiltros(filtros)}
            visoes={visoes}
          />
        </div>
      </Cartao>

      {faixas.length === 0 && (
        <Cartao>
          <Vazio
            titulo="Nenhuma OS no quadro"
            descricao="Nenhuma ordem atende a esses filtros."
          />
        </Cartao>
      )}

      {recorte === "STATUS"
        ? faixas.map((faixa) => (
            <QuadroOS
              key={faixa.chave}
              tecnicos={tecnicos}
              colunas={paraComponente(faixa.colunas)}
            />
          ))
        : faixas.map((faixa) => (
            <section key={faixa.chave || "sem-vinculo"} className="mb-5">
              <header className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">{faixa.rotulo}</h2>
                {faixa.detalhe && (
                  <span className="text-xs text-[var(--texto-3)]">
                    {faixa.detalhe}
                  </span>
                )}
                <Etiqueta tom="neutro">{faixa.total} OS</Etiqueta>
                {faixa.emRisco > 0 && (
                  <Etiqueta tom="critico">{faixa.emRisco} em risco</Etiqueta>
                )}
              </header>

              <QuadroOS
                tecnicos={tecnicos}
                colunas={paraComponente(faixa.colunas)}
              />
            </section>
          ))}
    </>
  );
}
