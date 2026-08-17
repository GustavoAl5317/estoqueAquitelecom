import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, ScanLine } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  NIVEL_ESTOQUE,
  STATUS_SERIAL,
  TIPO_CONTROLE,
  UNIDADE_MEDIDA,
} from "@/lib/dominio";
import { saldosConsolidados, timelineMaterial } from "@/lib/servicos/consultas";
import { moeda, numero, quantidade } from "@/lib/utils";
import {
  BarraNivel,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  ListaDefinicoes,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";
import { BarraDistribuicao } from "@/components/graficos";
import { LinhaDoTempo } from "@/components/linha-do-tempo";
import { FormularioAjuste } from "@/components/formulario-ajuste";

export const dynamic = "force-dynamic";

export default async function FichaMaterial({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const material = await prisma.material.findUnique({
    where: { id },
    include: { categoria: true },
  });
  if (!material) notFound();

  const [consolidado, saldos, unidades, eventos] = await Promise.all([
    saldosConsolidados(),
    prisma.saldo.findMany({
      where: { materialId: id },
      include: { detentor: { include: { estoque: true } } },
      orderBy: { quantidade: "desc" },
    }),
    material.controle === "SERIAL"
      ? prisma.unidadeSerial.findMany({
          where: { materialId: id },
          include: { detentor: true },
          orderBy: [{ status: "asc" }, { serial: "asc" }],
          take: 200,
        })
      : Promise.resolve([]),
    timelineMaterial(id, 60),
  ]);

  const resumo = consolidado.find((m) => m.materialId === id);

  const porStatusSerial = unidades.reduce<Record<string, number>>((mapa, u) => {
    mapa[u.status] = (mapa[u.status] ?? 0) + 1;
    return mapa;
  }, {});

  return (
    <>
      <CabecalhoPagina
        titulo={material.nome}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{material.codigoInterno}</span>
            <Etiqueta tom="neutro">{material.categoria.nome}</Etiqueta>
            <Etiqueta tom={TIPO_CONTROLE.tom(material.controle)}>
              {TIPO_CONTROLE.rotulo(material.controle)}
            </Etiqueta>
            {material.status !== "ATIVO" && (
              <Etiqueta tom="critico">Inativo</Etiqueta>
            )}
          </span>
        }
        acoes={
          <BotaoLink href={`/materiais/${id}/editar`}>
            <Pencil className="size-4" /> Editar
          </BotaoLink>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Metrica
          rotulo="Em estoque"
          valor={numero(resumo?.emEstoque ?? 0)}
          detalhe={UNIDADE_MEDIDA.rotulo(material.unidadeMedida)}
        />
        <Metrica
          rotulo="Com técnicos"
          valor={numero(resumo?.emPosseTecnicos ?? 0)}
          tom="roxo"
        />
        <Metrica
          rotulo="Com equipes"
          valor={numero(resumo?.emPosseEquipes ?? 0)}
          tom="positivo"
        />
        <Metrica
          rotulo="Reservado"
          valor={numero(resumo?.reservado ?? 0)}
          tom={resumo?.reservado ? "informativo" : "neutro"}
        />
        <Metrica
          rotulo="Realmente disponível"
          valor={quantidade(resumo?.disponivel ?? 0, material.unidadeMedida)}
          tom={NIVEL_ESTOQUE.tom(resumo?.nivel ?? "NORMAL")}
          detalhe={
            <span className="block">
              <span className="mb-1 block">
                {NIVEL_ESTOQUE.rotulo(resumo?.nivel ?? "NORMAL")} · mínimo{" "}
                {numero(material.quantidadeMinima)}
              </span>
              <BarraNivel
                percentual={resumo?.percentual ?? 0}
                tom={NIVEL_ESTOQUE.tom(resumo?.nivel ?? "NORMAL")}
              />
            </span>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* 1.8 / 1.9 — onde o material está agora */}
          <Cartao titulo="Onde está" semPadding>
            {saldos.filter((s) => s.quantidade > 0).length === 0 ? (
              <Vazio titulo="Sem saldo em nenhum detentor" />
            ) : (
              <>
                <div className="px-4 pt-4">
                  <BarraDistribuicao
                    partes={saldos
                      .filter((s) => s.quantidade > 0)
                      .map((s) => ({
                        rotulo: s.detentor.nome,
                        valor: s.quantidade,
                        cor:
                          s.detentor.tipo === "TECNICO"
                            ? "var(--roxo)"
                            : s.detentor.tipo === "EQUIPE"
                              ? "var(--positivo)"
                              : "var(--acento)",
                      }))}
                  />
                </div>
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Detentor</Th>
                      <Th>Tipo</Th>
                      <Th numerico>Quantidade</Th>
                      <Th numerico>Reservado</Th>
                      <Th numerico>Disponível</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {saldos
                      .filter((s) => s.quantidade > 0)
                      .map((saldo) => (
                        <Linha key={saldo.id}>
                          <Td>
                            <Link
                              href={`/locais/${saldo.detentorId}`}
                              className="font-medium hover:text-[var(--acento)]"
                            >
                              {saldo.detentor.nome}
                            </Link>
                          </Td>
                          <Td>
                            <Etiqueta
                              tom={
                                saldo.detentor.tipo === "TECNICO"
                                  ? "roxo"
                                  : saldo.detentor.tipo === "EQUIPE"
                                    ? "positivo"
                                    : "informativo"
                              }
                            >
                              {saldo.detentor.estoque?.nome
                                ? "Estoque"
                                : saldo.detentor.tipo === "TECNICO"
                                  ? "Técnico"
                                  : "Equipe"}
                            </Etiqueta>
                          </Td>
                          <Td numerico>
                            {quantidade(saldo.quantidade, material.unidadeMedida)}
                          </Td>
                          <Td numerico>
                            {saldo.reservado > 0 ? numero(saldo.reservado) : "—"}
                          </Td>
                          <Td numerico className="font-medium">
                            {numero(saldo.quantidade - saldo.reservado)}
                          </Td>
                        </Linha>
                      ))}
                  </tbody>
                </Tabela>
              </>
            )}
          </Cartao>

          {/* 1.3 / 1.13 — unidades individuais */}
          {material.controle === "SERIAL" && (
            <Cartao
              titulo="Equipamentos individuais"
              descricao={`${unidades.length} unidade(s) cadastrada(s)`}
              semPadding
              acoes={
                <span className="flex flex-wrap gap-1.5">
                  {Object.entries(porStatusSerial)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 4)
                    .map(([status, total]) => (
                      <Etiqueta key={status} tom={STATUS_SERIAL.tom(status)}>
                        {STATUS_SERIAL.rotulo(status)} {total}
                      </Etiqueta>
                    ))}
                </span>
              }
            >
              {unidades.length === 0 ? (
                <Vazio titulo="Nenhuma unidade cadastrada ainda" />
              ) : (
                <Tabela>
                  <thead>
                    <tr>
                      <Th>Serial</Th>
                      <Th>MAC</Th>
                      <Th>Status</Th>
                      <Th>Estado</Th>
                      <Th>Onde está</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {unidades.slice(0, 60).map((unidade) => (
                      <Linha key={unidade.id}>
                        <Td>
                          <Link
                            href={`/seriais/${unidade.id}`}
                            className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                          >
                            {unidade.serial}
                          </Link>
                        </Td>
                        <Td className="font-mono text-xs text-[var(--texto-3)]">
                          {unidade.macAddress ?? "—"}
                        </Td>
                        <Td>
                          <Etiqueta tom={STATUS_SERIAL.tom(unidade.status)} ponto>
                            {STATUS_SERIAL.rotulo(unidade.status)}
                          </Etiqueta>
                        </Td>
                        <Td>
                          <Etiqueta tom={ESTADO_FISICO.tom(unidade.estadoFisico)}>
                            {ESTADO_FISICO.rotulo(unidade.estadoFisico)}
                          </Etiqueta>
                        </Td>
                        <Td className="text-sm">
                          {unidade.detentor?.nome ??
                            (unidade.clienteRef
                              ? `Cliente ${unidade.clienteRef}`
                              : "—")}
                        </Td>
                      </Linha>
                    ))}
                  </tbody>
                </Tabela>
              )}
              {unidades.length > 60 && (
                <p className="border-t border-[var(--borda)] px-4 py-2.5 text-xs text-[var(--texto-3)]">
                  Exibindo 60 de {unidades.length} unidades.{" "}
                  <Link
                    href={`/seriais?material=${material.id}`}
                    className="text-[var(--acento)]"
                  >
                    Ver todas
                  </Link>
                </p>
              )}
            </Cartao>
          )}

          {/* 1.23 */}
          <Cartao titulo="Histórico completo" descricao="Últimos 60 movimentos">
            <LinhaDoTempo eventos={eventos} mostrarSerial />
          </Cartao>
        </div>

        <div className="space-y-4">
          <Cartao titulo="Cadastro">
            <ListaDefinicoes
              colunas={2}
              itens={[
                { rotulo: "Fabricante", valor: material.fabricante ?? "—" },
                { rotulo: "Modelo", valor: material.modelo ?? "—" },
                {
                  rotulo: "Unidade",
                  valor: UNIDADE_MEDIDA.rotulo(material.unidadeMedida),
                },
                { rotulo: "Valor médio", valor: moeda(material.valorMedio) },
                {
                  rotulo: "Quantidade mínima",
                  valor: quantidade(material.quantidadeMinima, material.unidadeMedida),
                },
                {
                  rotulo: "Quantidade ideal",
                  valor: quantidade(material.quantidadeIdeal, material.unidadeMedida),
                },
                {
                  rotulo: "Código de barras",
                  valor: material.codigoBarras ? (
                    <span className="flex items-center gap-1.5 font-mono text-xs">
                      <ScanLine className="size-3.5" /> {material.codigoBarras}
                    </span>
                  ) : (
                    "—"
                  ),
                },
                {
                  rotulo: "Valor total em estoque",
                  valor: moeda(resumo?.valorTotal ?? 0),
                },
              ]}
            />
            {material.descricao && (
              <p className="mt-4 border-t border-[var(--borda)] pt-3 text-sm text-[var(--texto-2)]">
                {material.descricao}
              </p>
            )}
          </Cartao>

          {/* 1.25 — ajuste manual com motivo obrigatório */}
          {material.controle === "QUANTIDADE" && (
            <Cartao
              titulo="Ajuste manual"
              descricao="Registra a diferença entre sistema e contagem física."
            >
              <FormularioAjuste
                materialId={material.id}
                unidade={material.unidadeMedida}
                detentores={saldos.map((s) => ({
                  id: s.detentorId,
                  nome: s.detentor.nome,
                  quantidade: s.quantidade,
                }))}
              />
            </Cartao>
          )}
        </div>
      </div>
    </>
  );
}
