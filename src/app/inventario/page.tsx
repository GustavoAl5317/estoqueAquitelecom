import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { STATUS_INVENTARIO, TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";
import { FormularioNovoInventario } from "@/components/formulario-inventario";

export const dynamic = "force-dynamic";

/** 1.26 — iniciar, contar, comparar, ajustar, finalizar. */
export default async function Inventarios() {
  const [inventarios, detentores] = await Promise.all([
    prisma.inventario.findMany({
      include: {
        detentor: true,
        iniciadoPor: { select: { nome: true } },
        itens: true,
      },
      orderBy: { iniciadoEm: "desc" },
      take: 50,
    }),
    prisma.detentor.findMany({
      where: {
        OR: [
          { estoque: { tipo: { notIn: TIPOS_ESTOQUE_SISTEMA } } },
          { tipo: { in: ["TECNICO", "EQUIPE"] } },
        ],
      },
      orderBy: [{ tipo: "asc" }, { nome: "asc" }],
    }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Inventário"
        descricao="Contagem física comparada com o saldo do sistema. Toda divergência vira ajuste rastreável, com motivo obrigatório."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Cartao
          className="lg:col-span-2"
          titulo={`${inventarios.length} inventário(s)`}
          semPadding
        >
          {inventarios.length === 0 ? (
            <Vazio
              titulo="Nenhum inventário realizado"
              descricao="Inicie uma contagem escolhendo o local ao lado."
            />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Número</Th>
                  <Th>Local</Th>
                  <Th numerico>Materiais</Th>
                  <Th numerico>Contados</Th>
                  <Th numerico>Divergências</Th>
                  <Th>Status</Th>
                  <Th>Início</Th>
                </tr>
              </thead>
              <tbody>
                {inventarios.map((inventario) => {
                  const contados = inventario.itens.filter(
                    (i) => i.quantidadeContada !== null,
                  ).length;
                  const divergentes = inventario.itens.filter(
                    (i) => i.diferenca !== null && i.diferenca !== 0,
                  ).length;

                  return (
                    <Linha key={inventario.id}>
                      <Td>
                        <Link
                          href={`/inventario/${inventario.id}`}
                          className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                        >
                          {inventario.numero}
                        </Link>
                      </Td>
                      <Td className="text-sm">{inventario.detentor.nome}</Td>
                      <Td numerico>{inventario.itens.length}</Td>
                      <Td numerico>
                        {contados}/{inventario.itens.length}
                      </Td>
                      <Td numerico>
                        {divergentes > 0 ? (
                          <span className="font-medium text-[var(--critico)]">
                            {divergentes}
                          </span>
                        ) : (
                          <span className="text-[var(--texto-3)]">—</span>
                        )}
                      </Td>
                      <Td>
                        <Etiqueta
                          tom={STATUS_INVENTARIO.tom(inventario.status)}
                          ponto
                        >
                          {STATUS_INVENTARIO.rotulo(inventario.status)}
                        </Etiqueta>
                      </Td>
                      <Td className="text-xs text-[var(--texto-3)]">
                        {dataHora(inventario.iniciadoEm)}
                        <span className="block">{inventario.iniciadoPor.nome}</span>
                      </Td>
                    </Linha>
                  );
                })}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <div className="space-y-4">
          <Cartao
            titulo={
              <span className="flex items-center gap-1.5">
                <ClipboardList className="size-3.5" /> Iniciar contagem
              </span>
            }
          >
            <FormularioNovoInventario
              detentores={detentores.map((d) => ({ id: d.id, nome: d.nome }))}
            />
          </Cartao>

          <Cartao titulo="Como funciona">
            <ol className="space-y-2 text-sm text-[var(--texto-2)]">
              {[
                "O saldo do sistema é congelado no momento da abertura.",
                "A equipe conta fisicamente e lança as quantidades.",
                "O sistema compara e mostra as divergências.",
                "Ao finalizar, cada divergência vira um ajuste com motivo.",
                "Material serializado não é ajustado por quantidade — a divergência fica marcada para conferência unidade a unidade.",
              ].map((passo, i) => (
                <li key={i} className="flex gap-2.5">
                  <span className="tabular shrink-0 font-mono text-xs text-[var(--texto-3)]">
                    {i + 1}.
                  </span>
                  {passo}
                </li>
              ))}
            </ol>
          </Cartao>
        </div>
      </div>
    </>
  );
}
