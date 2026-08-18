import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  ORIGEM_OS,
  PRIORIDADE_OS,
  SEVERIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS,
  TIPO_OS,
} from "@/lib/dominio";
import { detalheOrdem, prazoLegivel } from "@/lib/servicos/ordens";
import { materiaisDaOrdem } from "@/lib/servicos/ordens";
import { dataHora, moeda, numero, quantidade } from "@/lib/utils";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  ListaDefinicoes,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";
import {
  FormularioResponsavel,
  FormularioSituacao,
} from "@/components/formulario-os";

export const dynamic = "force-dynamic";

export default async function DetalheOS({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const ordem = await detalheOrdem(id);
  if (!ordem) notFound();

  const [material, tecnicos] = await Promise.all([
    materiaisDaOrdem(ordem.id),
    prisma.tecnico.findMany({
      where: { ativo: true },
      include: { equipe: { select: { nome: true } } },
      orderBy: { nome: "asc" },
    }),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo={`OS ${ordem.numero}`}
        descricao={ordem.titulo ?? ordem.cliente ?? "Sem descrição"}
        acoes={
          <>
            <Etiqueta tom={STATUS_OS.tom(ordem.status)} ponto>
              {STATUS_OS.rotulo(ordem.status)}
            </Etiqueta>
            <Etiqueta tom={PRIORIDADE_OS.tom(ordem.prioridade)}>
              {PRIORIDADE_OS.rotulo(ordem.prioridade)}
            </Etiqueta>
            <BotaoLink href="/os/quadro">Voltar ao quadro</BotaoLink>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Cartao titulo="Atendimento">
            <ListaDefinicoes
              colunas={3}
              itens={[
                { rotulo: "Tipo", valor: TIPO_OS.rotulo(ordem.tipo) },
                {
                  rotulo: "Severidade",
                  valor: (
                    <Etiqueta tom={SEVERIDADE_OS.tom(ordem.severidade)}>
                      {SEVERIDADE_OS.rotulo(ordem.severidade)}
                    </Etiqueta>
                  ),
                },
                { rotulo: "Origem", valor: ORIGEM_OS.rotulo(ordem.origem) },
                { rotulo: "Cliente", valor: ordem.cliente ?? "—" },
                { rotulo: "Contrato", valor: ordem.contrato ?? "—" },
                { rotulo: "Responsável", valor: ordem.tecnico?.nome ?? "—" },
                { rotulo: "Equipe", valor: ordem.equipe?.nome ?? "—" },
                {
                  rotulo: "Bairro",
                  valor: ordem.bairro?.nome ?? ordem.bairroNome ?? "—",
                },
                { rotulo: "Cidade", valor: ordem.cidade ?? "—" },
                {
                  rotulo: "Endereço",
                  valor: ordem.endereco ?? "—",
                },
                {
                  rotulo: "Coordenada",
                  valor:
                    ordem.latitude !== null && ordem.longitude !== null ? (
                      <span className="font-mono text-xs">
                        {ordem.latitude.toFixed(5)}, {ordem.longitude.toFixed(5)}
                      </span>
                    ) : (
                      <span className="text-[var(--atencao)]">
                        sem coordenada — fica fora do roteiro
                      </span>
                    ),
                },
                { rotulo: "Aberta em", valor: dataHora(ordem.abertaEm) },
                {
                  rotulo: "Prazo",
                  valor: ordem.prazo ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      {dataHora(ordem.prazo)}
                      <Etiqueta tom={SITUACAO_SLA.tom(ordem.situacao)}>
                        {prazoLegivel(ordem.minutosRestantes)}
                      </Etiqueta>
                    </span>
                  ) : (
                    "sem prazo"
                  ),
                },
                {
                  rotulo: "Concluída em",
                  valor: ordem.concluidaEm ? dataHora(ordem.concluidaEm) : "—",
                },
              ]}
            />

            {ordem.descricao && (
              <p className="mt-4 border-t border-[var(--borda)] pt-3 text-sm text-[var(--texto-2)]">
                {ordem.descricao}
              </p>
            )}
          </Cartao>

          {/* 1.34 */}
          <Cartao
            titulo="Material aplicado"
            descricao={
              material.consolidado.length
                ? `${numero(material.consolidado.length)} item(ns) · ${moeda(material.valorTotal)}`
                : undefined
            }
            semPadding
            acoes={
              <Link
                href={`/ordens/${ordem.id}`}
                className="flex items-center gap-1 text-xs font-medium text-[var(--acento)]"
              >
                Detalhe do consumo <ExternalLink className="size-3" aria-hidden />
              </Link>
            }
          >
            {material.consolidado.length === 0 ? (
              <Vazio
                titulo="Nenhum material lançado"
                descricao="Ao dar saída de material informando este número de OS, os itens aparecem aqui."
                acao={<BotaoLink href="/movimentacoes/nova">Lançar saída</BotaoLink>}
              />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th numerico>Usado</Th>
                    <Th numerico>Devolvido</Th>
                    <Th>Seriais</Th>
                    <Th numerico>Custo</Th>
                  </tr>
                </thead>
                <tbody>
                  {material.consolidado.map((item) => (
                    <Linha key={item.materialId}>
                      <Td className="text-sm font-medium">{item.nome}</Td>
                      <Td numerico>
                        {quantidade(item.usado, item.unidadeMedida)}
                      </Td>
                      <Td numerico>
                        {item.devolvido
                          ? quantidade(item.devolvido, item.unidadeMedida)
                          : "—"}
                      </Td>
                      <Td className="font-mono text-[11px] text-[var(--texto-3)]">
                        {item.seriais.slice(0, 3).join(", ") || "—"}
                        {item.seriais.length > 3 &&
                          ` +${item.seriais.length - 3}`}
                      </Td>
                      <Td numerico>{moeda(item.valor)}</Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Cartao>

          {ordem.materiaisPrevistos.length > 0 && (
            <Cartao
              titulo="Material previsto"
              descricao="O que o técnico precisa ter em posse para atender — critério do score."
              semPadding
            >
              <Tabela>
                <thead>
                  <tr>
                    <Th>Material</Th>
                    <Th numerico>Quantidade</Th>
                  </tr>
                </thead>
                <tbody>
                  {ordem.materiaisPrevistos.map((previsto) => (
                    <Linha key={previsto.id}>
                      <Td className="text-sm">{previsto.material.nome}</Td>
                      <Td numerico>
                        {quantidade(
                          previsto.quantidade,
                          previsto.material.unidadeMedida,
                        )}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            </Cartao>
          )}
        </div>

        <div className="space-y-4">
          <Cartao titulo="Responsável">
            <FormularioResponsavel
              ordemId={ordem.id}
              tecnicoId={ordem.tecnicoId}
              tecnicos={tecnicos.map((t) => ({
                id: t.id,
                nome: t.nome,
                equipe: t.equipe?.nome ?? null,
              }))}
            />
          </Cartao>

          <Cartao titulo="Situação">
            <FormularioSituacao ordemId={ordem.id} status={ordem.status} />
          </Cartao>

          {ordem.reservas.length > 0 && (
            <Cartao titulo="Reservas" semPadding>
              <ul className="divide-y divide-[var(--borda)]">
                {ordem.reservas.map((reserva) => (
                  <li
                    key={reserva.id}
                    className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                  >
                    <span className="truncate">{reserva.material.nome}</span>
                    <span className="tabular shrink-0 text-xs">
                      {numero(reserva.quantidade, 2)}
                    </span>
                  </li>
                ))}
              </ul>
            </Cartao>
          )}

          <Cartao titulo="Movimentações" semPadding>
            {ordem.movimentacoes.length === 0 ? (
              <Vazio titulo="Nenhuma movimentação" />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {ordem.movimentacoes.map((movimentacao) => (
                  <li key={movimentacao.id} className="px-4 py-2.5">
                    <Link
                      href={`/movimentacoes/${movimentacao.id}`}
                      className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                    >
                      {movimentacao.numero}
                    </Link>
                    <p className="text-xs text-[var(--texto-3)]">
                      {movimentacao.origem?.nome ?? "—"} →{" "}
                      {movimentacao.destino?.nome ?? "—"}
                    </p>
                    <p className="text-xs text-[var(--texto-3)]">
                      {dataHora(movimentacao.criadoEm)} ·{" "}
                      {movimentacao.responsavel.nome}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
