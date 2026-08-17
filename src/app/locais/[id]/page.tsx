import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, ClipboardList } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ESTADO_FISICO,
  STATUS_SERIAL,
  TIPO_ESTOQUE,
  TIPO_MOVIMENTO,
} from "@/lib/dominio";
import { estoqueDoDetentor } from "@/lib/servicos/consultas";
import { dataHora, moeda, numero, quantidade, tempoRelativo } from "@/lib/utils";
import {
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

export const dynamic = "force-dynamic";

/** 1.8 / 1.9 — o estoque individual de um técnico, equipe ou local físico. */
export default async function FichaLocal({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const dados = await estoqueDoDetentor(id);
  if (!dados) notFound();

  const { detentor, saldos, unidades, valorTotal } = dados;

  const movimentos = await prisma.movimento.findMany({
    where: { OR: [{ origemId: id }, { destinoId: id }] },
    include: {
      material: { select: { nome: true, unidadeMedida: true } },
      origem: true,
      destino: true,
      usuario: { select: { nome: true } },
      unidade: { select: { serial: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: 30,
  });

  const ultimoMovimento = movimentos[0];
  const totalItens = saldos.reduce((s, x) => s + x.quantidade, 0);
  const totalReservado = saldos.reduce((s, x) => s + x.reservado, 0);

  const subtitulo =
    detentor.tipo === "ESTOQUE"
      ? TIPO_ESTOQUE.rotulo(detentor.estoque?.tipo ?? "")
      : detentor.tipo === "TECNICO"
        ? `Técnico${detentor.tecnico?.equipe ? ` · ${detentor.tecnico.equipe.nome}` : ""}`
        : "Equipe";

  return (
    <>
      <CabecalhoPagina
        titulo={detentor.nome}
        descricao={
          <span className="flex flex-wrap items-center gap-2">
            <Etiqueta
              tom={
                detentor.tipo === "TECNICO"
                  ? "roxo"
                  : detentor.tipo === "EQUIPE"
                    ? "positivo"
                    : "informativo"
              }
            >
              {subtitulo}
            </Etiqueta>
            {detentor.estoque?.endereco && (
              <span className="text-sm">{detentor.estoque.endereco}</span>
            )}
          </span>
        }
        acoes={
          <>
            {detentor.tipo === "ESTOQUE" && (
              <BotaoLink href={`/inventario/novo?detentor=${id}`}>
                <ClipboardList className="size-4" /> Inventariar
              </BotaoLink>
            )}
            <BotaoLink href={`/movimentacoes/nova?origem=${id}`} variante="primario">
              <ArrowLeftRight className="size-4" /> Movimentar
            </BotaoLink>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Materiais diferentes" valor={numero(saldos.length)} />
        <Metrica rotulo="Itens em posse" valor={numero(totalItens)} />
        <Metrica
          rotulo="Reservado"
          valor={numero(totalReservado)}
          tom={totalReservado > 0 ? "informativo" : "neutro"}
        />
        <Metrica
          rotulo="Valor em posse"
          valor={moeda(valorTotal)}
          tom="informativo"
          detalhe={
            ultimoMovimento
              ? `Última movimentação ${tempoRelativo(ultimoMovimento.criadoEm)}`
              : "Sem movimentações"
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao
            titulo="Materiais em posse"
            descricao={`${saldos.length} material(is) com saldo`}
            semPadding
          >
            {saldos.length === 0 ? (
              <Vazio
                titulo="Nenhum material em posse"
                descricao="Este detentor não possui saldo no momento."
              />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th>Categoria</Th>
                    <Th numerico>Quantidade</Th>
                    <Th numerico>Reservado</Th>
                    <Th numerico>Valor</Th>
                  </tr>
                </thead>
                <tbody>
                  {saldos.map((saldo) => (
                    <Linha key={saldo.id}>
                      <Td>
                        <Link
                          href={`/materiais/${saldo.materialId}`}
                          className="font-medium hover:text-[var(--acento)]"
                        >
                          {saldo.material.nome}
                        </Link>
                        <span className="block text-xs text-[var(--texto-3)]">
                          {saldo.material.codigoInterno}
                        </span>
                      </Td>
                      <Td>
                        <span className="flex items-center gap-1.5 text-sm">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: saldo.material.categoria.cor }}
                          />
                          {saldo.material.categoria.nome}
                        </span>
                      </Td>
                      <Td numerico className="font-medium">
                        {quantidade(saldo.quantidade, saldo.material.unidadeMedida)}
                      </Td>
                      <Td numerico>
                        {saldo.reservado > 0 ? numero(saldo.reservado) : "—"}
                      </Td>
                      <Td numerico>
                        {moeda(saldo.quantidade * saldo.material.valorMedio)}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Cartao>

          {unidades.length > 0 && (
            <Cartao
              titulo="Equipamentos individuais"
              descricao={`${unidades.length} unidade(s) sob responsabilidade`}
              semPadding
            >
              <Tabela>
                <thead>
                  <tr>
                    <Th>Serial</Th>
                    <Th>Material</Th>
                    <Th>Status</Th>
                    <Th>Estado</Th>
                    <Th>Desde</Th>
                  </tr>
                </thead>
                <tbody>
                  {unidades.slice(0, 40).map((unidade) => (
                    <Linha key={unidade.id}>
                      <Td>
                        <Link
                          href={`/seriais/${unidade.id}`}
                          className="font-mono text-xs font-medium hover:text-[var(--acento)]"
                        >
                          {unidade.serial}
                        </Link>
                      </Td>
                      <Td className="text-sm">{unidade.material.nome}</Td>
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
                      <Td className="text-xs text-[var(--texto-3)]">
                        {tempoRelativo(unidade.atualizadoEm)}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </Cartao>
          )}
        </div>

        <div className="space-y-4">
          {detentor.estoque && (
            <Cartao titulo="Dados do local">
              <ListaDefinicoes
                colunas={1}
                itens={[
                  {
                    rotulo: "Tipo",
                    valor: TIPO_ESTOQUE.rotulo(detentor.estoque.tipo),
                  },
                  { rotulo: "Endereço", valor: detentor.estoque.endereco ?? "—" },
                  {
                    rotulo: "Responsável",
                    valor: detentor.estoque.responsavel?.nome ?? "—",
                  },
                  {
                    rotulo: "Coordenadas",
                    valor:
                      detentor.estoque.latitude && detentor.estoque.longitude
                        ? `${detentor.estoque.latitude}, ${detentor.estoque.longitude}`
                        : "—",
                  },
                  { rotulo: "Status", valor: detentor.estoque.status },
                  {
                    rotulo: "Criado em",
                    valor: dataHora(detentor.estoque.criadoEm),
                  },
                ]}
              />
            </Cartao>
          )}

          {detentor.tecnico && (
            <Cartao titulo="Dados do técnico">
              <ListaDefinicoes
                colunas={1}
                itens={[
                  { rotulo: "Matrícula", valor: detentor.tecnico.matricula },
                  { rotulo: "Telefone", valor: detentor.tecnico.telefone ?? "—" },
                  { rotulo: "Equipe", valor: detentor.tecnico.equipe?.nome ?? "—" },
                  { rotulo: "Status", valor: detentor.tecnico.status },
                ]}
              />
            </Cartao>
          )}

          <Cartao titulo="Últimas movimentações" semPadding>
            {movimentos.length === 0 ? (
              <Vazio titulo="Nenhuma movimentação" />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {movimentos.slice(0, 12).map((movimento) => {
                  const entrando = movimento.destinoId === id;
                  return (
                    <li key={movimento.id} className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Etiqueta tom={TIPO_MOVIMENTO.tom(movimento.tipo)}>
                          {TIPO_MOVIMENTO.rotulo(movimento.tipo)}
                        </Etiqueta>
                        <span
                          className="tabular text-sm font-medium"
                          style={{
                            color: entrando
                              ? "var(--positivo)"
                              : "var(--critico)",
                          }}
                        >
                          {entrando ? "+" : "−"}
                          {numero(movimento.quantidade, 2)}
                        </span>
                        <span className="ml-auto text-xs text-[var(--texto-3)]">
                          {tempoRelativo(movimento.criadoEm)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm">
                        {movimento.material.nome}
                        {movimento.unidade && (
                          <span className="ml-1.5 font-mono text-xs text-[var(--texto-3)]">
                            {movimento.unidade.serial}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--texto-3)]">
                        {entrando
                          ? `de ${movimento.origem?.nome ?? "externo"}`
                          : `para ${movimento.destino?.nome ?? "fora do estoque"}`}
                        {movimento.usuario && ` · ${movimento.usuario.nome}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
