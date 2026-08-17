import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { STATUS_INVENTARIO } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  ListaDefinicoes,
  Metrica,
} from "@/components/ui";
import { FolhaDeContagem } from "@/components/formulario-inventario";

export const dynamic = "force-dynamic";

export default async function FichaInventario({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const inventario = await prisma.inventario.findUnique({
    where: { id },
    include: {
      detentor: true,
      iniciadoPor: { select: { nome: true } },
      itens: {
        include: { material: true },
        orderBy: { material: { nome: "asc" } },
      },
    },
  });
  if (!inventario) notFound();

  const encerrado =
    inventario.status === "CONCLUIDO" || inventario.status === "CANCELADO";

  const contados = inventario.itens.filter(
    (i) => i.quantidadeContada !== null,
  ).length;
  const divergentes = inventario.itens.filter(
    (i) => i.diferenca !== null && i.diferenca !== 0,
  );
  const ajustados = inventario.itens.filter((i) => i.ajustado).length;

  return (
    <>
      <CabecalhoPagina
        titulo={inventario.numero}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Etiqueta tom={STATUS_INVENTARIO.tom(inventario.status)} ponto>
              {STATUS_INVENTARIO.rotulo(inventario.status)}
            </Etiqueta>
            <Link
              href={`/locais/${inventario.detentorId}`}
              className="text-sm hover:text-[var(--acento)]"
            >
              {inventario.detentor.nome}
            </Link>
          </span>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Materiais" valor={numero(inventario.itens.length)} />
        <Metrica
          rotulo="Contados"
          valor={`${contados}/${inventario.itens.length}`}
          tom={contados === inventario.itens.length ? "positivo" : "atencao"}
        />
        <Metrica
          rotulo="Divergências"
          valor={numero(divergentes.length)}
          tom={divergentes.length > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Ajustes aplicados"
          valor={numero(ajustados)}
          tom={ajustados > 0 ? "atencao" : "neutro"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Cartao
          className="lg:col-span-3"
          titulo="Folha de contagem"
          descricao={
            encerrado
              ? "Inventário encerrado — valores registrados no histórico."
              : "Lance a contagem física de cada material."
          }
        >
          <FolhaDeContagem
            inventarioId={inventario.id}
            encerrado={encerrado}
            itens={inventario.itens.map((item) => ({
              id: item.id,
              materialNome: item.material.nome,
              codigoInterno: item.material.codigoInterno,
              unidadeMedida: item.material.unidadeMedida,
              serializado: item.material.controle === "SERIAL",
              quantidadeSistema: item.quantidadeSistema,
              quantidadeContada: item.quantidadeContada,
            }))}
          />
        </Cartao>

        <div className="space-y-4">
          <Cartao titulo="Dados">
            <ListaDefinicoes
              colunas={1}
              itens={[
                { rotulo: "Número", valor: inventario.numero },
                { rotulo: "Local", valor: inventario.detentor.nome },
                {
                  rotulo: "Status",
                  valor: STATUS_INVENTARIO.rotulo(inventario.status),
                },
                { rotulo: "Iniciado por", valor: inventario.iniciadoPor.nome },
                { rotulo: "Início", valor: dataHora(inventario.iniciadoEm) },
                {
                  rotulo: "Encerramento",
                  valor: inventario.finalizadoEm
                    ? dataHora(inventario.finalizadoEm)
                    : "—",
                },
              ]}
            />
            {inventario.observacao && (
              <p className="mt-3 border-t border-[var(--borda)] pt-3 text-sm text-[var(--texto-2)]">
                {inventario.observacao}
              </p>
            )}
          </Cartao>

          {divergentes.length > 0 && (
            <Cartao titulo="Divergências">
              <ul className="space-y-2.5 text-sm">
                {divergentes.map((item) => (
                  <li key={item.id}>
                    <p className="font-medium">{item.material.nome}</p>
                    <p className="tabular text-[var(--texto-2)]">
                      Sistema {numero(item.quantidadeSistema, 2)} · Contagem{" "}
                      {numero(item.quantidadeContada ?? 0, 2)} ·{" "}
                      <span
                        style={{
                          color:
                            (item.diferenca ?? 0) < 0
                              ? "var(--critico)"
                              : "var(--positivo)",
                        }}
                      >
                        {(item.diferenca ?? 0) > 0 ? "+" : ""}
                        {numero(item.diferenca ?? 0, 2)}
                      </span>
                    </p>
                    {item.observacao && (
                      <p className="text-xs text-[var(--texto-3)]">
                        {item.observacao}
                      </p>
                    )}
                    {item.ajustado && (
                      <Etiqueta tom="atencao">ajuste aplicado</Etiqueta>
                    )}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
