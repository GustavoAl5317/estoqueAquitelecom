import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ESTADO_FISICO, STATUS_SERIAL } from "@/lib/dominio";
import { timelineSerial } from "@/lib/servicos/consultas";
import { dataHora, moeda } from "@/lib/utils";
import {
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  ListaDefinicoes,
} from "@/components/ui";
import { LinhaDoTempo } from "@/components/linha-do-tempo";
import { CodigoQr } from "@/components/codigo-qr";

export const dynamic = "force-dynamic";

/** 1.13 / 1.23 / 1.27 — ficha do equipamento, alvo da leitura por QR Code */
export default async function FichaSerial({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const unidade = await prisma.unidadeSerial.findUnique({
    where: { id },
    include: {
      material: { include: { categoria: true } },
      detentor: true,
      entradaItem: { include: { entrada: true } },
    },
  });
  if (!unidade) notFound();

  const [eventos, triagens] = await Promise.all([
    timelineSerial(id),
    prisma.triagem.findMany({
      where: { unidadeId: id },
      include: { responsavel: true, destino: true },
      orderBy: { criadoEm: "desc" },
    }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo={unidade.serial}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Link
              href={`/materiais/${unidade.materialId}`}
              className="hover:text-[var(--acento)]"
            >
              {unidade.material.nome}
            </Link>
            <Etiqueta tom={STATUS_SERIAL.tom(unidade.status)} ponto>
              {STATUS_SERIAL.rotulo(unidade.status)}
            </Etiqueta>
            <Etiqueta tom={ESTADO_FISICO.tom(unidade.estadoFisico)}>
              {ESTADO_FISICO.rotulo(unidade.estadoFisico)}
            </Etiqueta>
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Identificação">
            <ListaDefinicoes
              colunas={3}
              itens={[
                {
                  rotulo: "Serial",
                  valor: <span className="font-mono text-xs">{unidade.serial}</span>,
                },
                {
                  rotulo: "MAC Address",
                  valor: (
                    <span className="font-mono text-xs">
                      {unidade.macAddress ?? "—"}
                    </span>
                  ),
                },
                {
                  rotulo: "Patrimônio",
                  valor: (
                    <span className="font-mono text-xs">
                      {unidade.patrimonio ?? "—"}
                    </span>
                  ),
                },
                { rotulo: "Lote", valor: unidade.lote ?? "—" },
                {
                  rotulo: "Categoria",
                  valor: unidade.material.categoria.nome,
                },
                {
                  rotulo: "Modelo",
                  valor:
                    [unidade.material.fabricante, unidade.material.modelo]
                      .filter(Boolean)
                      .join(" ") || "—",
                },
                {
                  rotulo: "Onde está",
                  valor: unidade.detentor ? (
                    <Link
                      href={`/locais/${unidade.detentorId}`}
                      className="hover:text-[var(--acento)]"
                    >
                      {unidade.detentor.nome}
                    </Link>
                  ) : unidade.clienteRef ? (
                    `Cliente ${unidade.clienteRef}`
                  ) : (
                    "Fora do estoque"
                  ),
                },
                {
                  rotulo: "Valor unitário",
                  valor: unidade.valorUnitario ? moeda(unidade.valorUnitario) : "—",
                },
                {
                  rotulo: "Entrada de origem",
                  valor: unidade.entradaItem?.entrada ? (
                    <Link
                      href={`/entradas/${unidade.entradaItem.entrada.id}`}
                      className="hover:text-[var(--acento)]"
                    >
                      {unidade.entradaItem.entrada.numero}
                    </Link>
                  ) : (
                    "—"
                  ),
                },
              ]}
            />
          </Cartao>

          {/* 1.23 — identidade operacional do equipamento */}
          <Cartao titulo="Ciclo de vida" descricao="Todo o histórico da unidade">
            <LinhaDoTempo eventos={eventos} />
          </Cartao>
        </div>

        <div className="space-y-4">
          {/* 1.27 */}
          <Cartao
            titulo="QR Code"
            descricao="Aponte a câmera para abrir esta ficha."
          >
            <div className="flex flex-col items-center gap-3">
              <CodigoQr texto={unidade.serial} />
              <p className="text-center font-mono text-xs text-[var(--texto-2)]">
                {unidade.serial}
              </p>
            </div>
          </Cartao>

          {/* 1.12 */}
          {triagens.length > 0 && (
            <Cartao titulo="Passagens pela triagem">
              <ul className="space-y-3">
                {triagens.map((triagem) => (
                  <li
                    key={triagem.id}
                    className="border-l-2 border-[var(--roxo)] pl-3"
                  >
                    <p className="text-sm font-medium">
                      {triagem.resultado
                        ? triagem.resultado === "APROVADO"
                          ? "Aprovado — retornou ao estoque"
                          : triagem.resultado === "MANUTENCAO"
                            ? "Enviado para manutenção"
                            : "Descartado"
                        : "Aguardando triagem"}
                    </p>
                    <p className="text-xs text-[var(--texto-3)]">
                      {dataHora(triagem.concluidoEm ?? triagem.criadoEm)}
                      {triagem.responsavel && ` · ${triagem.responsavel.nome}`}
                    </p>
                    {triagem.laudo && (
                      <p className="mt-1 text-xs text-[var(--texto-2)]">
                        {triagem.laudo}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Datas">
            <ListaDefinicoes
              colunas={1}
              itens={[
                { rotulo: "Cadastrado em", valor: dataHora(unidade.criadoEm) },
                {
                  rotulo: "Última atualização",
                  valor: dataHora(unidade.atualizadoEm),
                },
              ]}
            />
          </Cartao>
        </div>
      </div>
    </>
  );
}
