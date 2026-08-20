import Link from "next/link";
import { Plus, Columns3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  PRIORIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS,
  STATUS_OS_ABERTOS,
  TIPO_OS,
} from "@/lib/dominio";
import {
  cargaPorTecnico,
  indicadoresOrdens,
  intervaloDoDia,
  listarOrdens,
  prazoLegivel,
} from "@/lib/servicos/ordens";
import { visoesParaTela } from "@/lib/servicos/visoes";
import { usuarioAtual } from "@/lib/sessao";
import { data, numero, percentual, queryDeFiltros } from "@/lib/utils";
import { VisoesSalvas } from "@/components/visoes-salvas";
import {
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Linha,
  Metrica,
  Tabela,
  Td,
  Th,
  Vazio,
} from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * BLOCO 2 — ORDENS DE SERVIÇO.
 *
 * A lista é a visão de quem precisa achar uma OS específica; o quadro é a de
 * quem precisa tocar o dia. As duas leem exatamente a mesma base.
 */
export default async function OrdensDeServico({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    tecnicoId?: string;
    prioridade?: string;
    tipo?: string;
    q?: string;
    risco?: string;
    periodo?: string;
  }>;
}) {
  const filtros = await searchParams;

  const usuario = await usuarioAtual();

  // "hoje" é o atalho que a operação mais usa — focar no que abriu no dia
  const periodo =
    filtros.periodo === "hoje" || filtros.periodo === "7" || filtros.periodo === "30"
      ? filtros.periodo
      : "";
  const janela =
    periodo === "hoje"
      ? intervaloDoDia()
      : periodo === "7" || periodo === "30"
        ? { desde: new Date(Date.now() - Number(periodo) * 86_400_000), ate: undefined }
        : {};

  const [ordens, indicadores, carga, tecnicos, visoes] = await Promise.all([
    listarOrdens({
      status: filtros.status ? [filtros.status] : undefined,
      tecnicoId: filtros.tecnicoId,
      prioridade: filtros.prioridade,
      tipo: filtros.tipo,
      busca: filtros.q,
      somenteRisco: filtros.risco === "1",
      ...janela,
    }),
    indicadoresOrdens(),
    cargaPorTecnico(),
    prisma.tecnico.findMany({
      where: { ativo: true },
      select: { id: true, nome: true },
      orderBy: { nome: "asc" },
    }),
    visoesParaTela("/os", usuario.id),
  ]);

  const temFiltro = Boolean(
    filtros.status ||
      filtros.tecnicoId ||
      filtros.prioridade ||
      filtros.tipo ||
      filtros.q ||
      filtros.risco ||
      periodo,
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Ordens de serviço"
        descricao="Quem atende, em que pé está e quanto tempo falta. O cadastro completo do cliente continua no SGP."
        acoes={
          <>
            <BotaoLink href="/os/quadro">
              <Columns3 className="size-4" aria-hidden /> Quadro
            </BotaoLink>
            <BotaoLink href="/os/nova" variante="primario">
              <Plus className="size-4" aria-hidden /> Nova OS
            </BotaoLink>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metrica
          rotulo="Abertas"
          valor={numero(indicadores.abertas)}
          detalhe={`${indicadores.semResponsavel} sem responsável`}
          tom={indicadores.semResponsavel > 0 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Em risco de SLA"
          valor={numero(indicadores.emRisco)}
          tom={indicadores.emRisco > 0 ? "critico" : "positivo"}
          href="/os?risco=1"
        />
        <Metrica
          rotulo="Emergenciais"
          valor={numero(indicadores.emergenciais)}
          tom={indicadores.emergenciais > 0 ? "critico" : "neutro"}
          href="/os?prioridade=P1"
        />
        <Metrica
          rotulo="Tempo médio"
          valor={`${numero(indicadores.horasMedias, 1)} h`}
          detalhe="da abertura à conclusão"
        />
        <Metrica
          rotulo="Aderência ao SLA"
          valor={
            indicadores.aderenciaSla === null
              ? "—"
              : percentual(indicadores.aderenciaSla)
          }
          tom={
            indicadores.aderenciaSla === null
              ? "neutro"
              : indicadores.aderenciaSla >= 90
                ? "positivo"
                : indicadores.aderenciaSla >= 70
                  ? "atencao"
                  : "critico"
          }
        />
      </div>

      <Cartao className="mb-4">
        <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="OS, cliente, endereço"
            className="lg:col-span-2"
          />
          <select name="status" defaultValue={filtros.status ?? ""}>
            <option value="">Todas as situações</option>
            {STATUS_OS.opcoes.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
          <select name="prioridade" defaultValue={filtros.prioridade ?? ""}>
            <option value="">Todas as prioridades</option>
            {PRIORIDADE_OS.opcoes.map((opcao) => (
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
          <select name="periodo" defaultValue={periodo}>
            <option value="">Qualquer data</option>
            <option value="hoje">Abertas hoje</option>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-[var(--acento)] px-3 py-1.5 text-sm font-medium text-white"
            >
              Filtrar
            </button>
            {temFiltro && (
              <Link
                href="/os"
                className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)]"
              >
                Limpar
              </Link>
            )}
          </div>
        </form>

        <div className="mt-3 border-t border-[var(--borda)] pt-3">
          <VisoesSalvas
            tela="/os"
            filtrosAtuais={queryDeFiltros(filtros)}
            visoes={visoes}
          />
        </div>
      </Cartao>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="xl:col-span-3">
          <Cartao titulo={`${numero(ordens.length)} ordem(ns)`} semPadding>
            {ordens.length === 0 ? (
              <Vazio
                titulo="Nenhuma OS encontrada"
                descricao={
                  temFiltro
                    ? "Nenhuma ordem atende a esses filtros."
                    : "Registre a primeira OS ou importe do SGP quando o token tiver permissão."
                }
                acao={<BotaoLink href="/os/nova">Nova OS</BotaoLink>}
              />
            ) : (
              <Tabela>
                <thead>
                  <tr>
                    <Th>OS</Th>
                    <Th>Cliente</Th>
                    <Th>Tipo</Th>
                    <Th>Situação</Th>
                    <Th>Responsável</Th>
                    <Th>Prazo</Th>
                    <Th>Aberta</Th>
                  </tr>
                </thead>
                <tbody>
                  {ordens.map((ordem) => (
                    <Linha key={ordem.id}>
                      <Td>
                        <Link
                          href={`/os/${ordem.id}`}
                          className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                        >
                          {ordem.numero}
                        </Link>
                        <span className="mt-0.5 block">
                          <Etiqueta tom={PRIORIDADE_OS.tom(ordem.prioridade)}>
                            {ordem.prioridade}
                          </Etiqueta>
                        </span>
                      </Td>
                      <Td className="max-w-56">
                        <span className="block truncate text-sm">
                          {ordem.cliente ?? (
                            <span className="text-[var(--texto-3)]">
                              não informado
                            </span>
                          )}
                        </span>
                        {(ordem.bairro?.nome ?? ordem.bairroNome) && (
                          <span className="block truncate text-xs text-[var(--texto-3)]">
                            {ordem.bairro?.nome ?? ordem.bairroNome}
                          </span>
                        )}
                      </Td>
                      <Td className="text-sm">{TIPO_OS.rotulo(ordem.tipo)}</Td>
                      <Td>
                        <Etiqueta tom={STATUS_OS.tom(ordem.status)} ponto>
                          {STATUS_OS.rotulo(ordem.status)}
                        </Etiqueta>
                      </Td>
                      <Td className="text-sm">
                        {ordem.tecnico?.nome ?? (
                          <span className="text-[var(--atencao)]">sem responsável</span>
                        )}
                      </Td>
                      <Td>
                        <Etiqueta tom={SITUACAO_SLA.tom(ordem.situacao)}>
                          {ordem.situacao === "SEM_PRAZO"
                            ? "sem prazo"
                            : prazoLegivel(ordem.minutosRestantes)}
                        </Etiqueta>
                      </Td>
                      <Td className="text-xs text-[var(--texto-3)]">
                        {data(ordem.abertaEm)}
                      </Td>
                    </Linha>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Cartao>
        </div>

        {/* 2.34 */}
        <Cartao
          titulo="Carga por técnico"
          descricao={`Média de ${numero(carga.media, 1)} OS abertas`}
          semPadding
        >
          <ul className="divide-y divide-[var(--borda)]">
            {carga.linhas.map((linha) => (
              <li key={linha.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Link
                    href={`/os?tecnicoId=${linha.id}`}
                    className="truncate text-sm font-medium hover:text-[var(--acento)]"
                  >
                    {linha.nome}
                  </Link>
                  <span
                    className="tabular text-sm font-semibold"
                    style={{
                      color:
                        linha.abertas > carga.media * 1.5
                          ? "var(--critico)"
                          : "var(--texto)",
                    }}
                  >
                    {linha.abertas}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {linha.emergenciais > 0 && (
                    <Etiqueta tom="critico">{linha.emergenciais} P1</Etiqueta>
                  )}
                  {linha.emRisco > 0 && (
                    <Etiqueta tom="atencao">{linha.emRisco} em risco</Etiqueta>
                  )}
                  {linha.equipe && (
                    <span className="text-xs text-[var(--texto-3)]">
                      {linha.equipe}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="border-t border-[var(--borda)] px-4 py-2 text-xs text-[var(--texto-3)]">
            Conta apenas OS em {STATUS_OS_ABERTOS.length} situações abertas.
          </p>
        </Cartao>
      </div>
    </>
  );
}
