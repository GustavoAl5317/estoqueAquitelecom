import Link from "next/link";
import { MapPin, Package } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/sessao";
import {
  PRIORIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS_ABERTOS,
  STATUS_TECNICO,
} from "@/lib/dominio";
import { listarOrdens, prazoLegivel } from "@/lib/servicos/ordens";
import { rotuloDoTipo, todosTiposOS } from "@/lib/servicos/tipos-os";
import { roteiroDoTecnico } from "@/lib/servicos/roteiro";
import { hora, numero, quantidade, tempoRelativo } from "@/lib/utils";
import {
  Aviso,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";
import { ControleDeJornada, PassoDoAtendimento } from "@/components/campo";

export const dynamic = "force-dynamic";

/**
 * 3.63 — ÁREA WEB DO TÉCNICO.
 *
 * Não existe aplicativo: é a mesma plataforma, com uma tela desenhada para
 * quem está na rua com uma mão só. Um atendimento por vez, o próximo passo
 * como um botão grande, e o resto do dia abaixo.
 */
export default async function MeuDia() {
  const usuario = await exigir("os.executar");

  if (!usuario.tecnicoId) {
    return (
      <>
        <CabecalhoPagina titulo="Meu dia" />
        <Aviso tom="atencao" titulo="Seu usuário não está ligado a um técnico">
          Esta tela mostra as ordens de serviço do técnico correspondente ao seu
          usuário. Peça a um administrador para fazer esse vínculo.
        </Aviso>
      </>
    );
  }

  const [tecnico, ordens, roteiro, posse, ultima, tipos] = await Promise.all([
    prisma.tecnico.findUnique({
      where: { id: usuario.tecnicoId },
      include: { equipe: true, detentor: true },
    }),
    listarOrdens({ tecnicoId: usuario.tecnicoId, status: STATUS_OS_ABERTOS }),
    roteiroDoTecnico(usuario.tecnicoId),
    prisma.saldo.findMany({
      where: {
        detentor: { tecnicoId: usuario.tecnicoId },
        quantidade: { gt: 0 },
      },
      include: { material: true },
      orderBy: { quantidade: "desc" },
      take: 12,
    }),
    prisma.localizacaoTecnico.findFirst({
      where: { tecnicoId: usuario.tecnicoId },
      orderBy: { capturadoEm: "desc" },
    }),
    todosTiposOS(),
  ]);

  const emJornada = tecnico?.status !== "FORA_JORNADA";

  // a que está em andamento vem primeiro; senão, a primeira parada do roteiro
  const emAndamento = ordens.find(
    (o) => o.status === "EM_DESLOCAMENTO" || o.status === "EM_ATENDIMENTO",
  );
  const sugerida = roteiro?.paradas[0];
  const atual =
    emAndamento ?? ordens.find((o) => o.id === sugerida?.ordemId) ?? ordens[0];

  /**
   * A lista abaixo segue o roteiro, não a prioridade.
   *
   * O cartão promete "na ordem sugerida pelo roteiro" e cada linha mostra a
   * chegada estimada. Vindo direto de `listarOrdens`, que ordena por prioridade,
   * os horários saíam fora de sequência — "chegada ~14:20" acima de
   * "chegada ~10:05" — e o técnico não tem como saber qual das duas leituras
   * vale. OS sem coordenada não entra no roteiro e fica no fim, com a ordem de
   * prioridade preservada entre elas.
   */
  const posicaoNoRoteiro = new Map(
    roteiro?.paradas.map((parada, indice) => [parada.ordemId, indice]) ?? [],
  );
  const demais = ordens
    .filter((o) => o.id !== atual?.id)
    .sort(
      (a, b) =>
        (posicaoNoRoteiro.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (posicaoNoRoteiro.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  const emRisco = ordens.filter(
    (o) => o.situacao === "ESTOURADO" || o.situacao === "ATENCAO",
  ).length;

  return (
    <>
      <CabecalhoPagina
        titulo={`Olá, ${tecnico?.nome.split(" ")[0] ?? usuario.nome.split(" ")[0]}`}
        descricao={
          ordens.length
            ? `${ordens.length} ordem(ns) em aberto${emRisco ? ` · ${emRisco} com prazo apertado` : ""}.`
            : "Nenhuma ordem aberta para você agora."
        }
        acoes={
          tecnico && (
            <Etiqueta tom={STATUS_TECNICO.tom(tecnico.status)} ponto>
              {STATUS_TECNICO.rotulo(tecnico.status)}
            </Etiqueta>
          )
        }
      />

      {/* 3.4 / 3.5 */}
      <Cartao className="mb-4">
        <ControleDeJornada
          emJornada={emJornada}
          ultimaPosicao={ultima ? tempoRelativo(ultima.capturadoEm) : null}
        />
      </Cartao>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Metrica rotulo="Em aberto" valor={numero(ordens.length)} />
        <Metrica
          rotulo="Prazo apertado"
          valor={numero(emRisco)}
          tom={emRisco > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Rota do dia"
          valor={roteiro ? `${numero(roteiro.totalKm, 1)} km` : "—"}
          detalhe={
            roteiro?.fimPrevisto ? `termina ~${hora(roteiro.fimPrevisto)}` : undefined
          }
        />
      </div>

      {!atual ? (
        <Cartao semPadding>
          <Vazio
            titulo="Nada na fila"
            descricao="Quando a supervisão atribuir uma ordem a você, ela aparece aqui."
          />
        </Cartao>
      ) : (
        <Cartao
          titulo="Atendimento atual"
          descricao={
            emAndamento
              ? "Você já está nesta ordem."
              : "Sugestão do roteiro — a mais próxima considerando a urgência."
          }
          className="mb-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/os/${atual.id}`}
              className="font-mono text-sm font-semibold hover:text-[var(--acento)]"
            >
              {atual.numero}
            </Link>
            <Etiqueta tom={PRIORIDADE_OS.tom(atual.prioridade)}>
              {atual.prioridade}
            </Etiqueta>
            <Etiqueta tom={SITUACAO_SLA.tom(atual.situacao)}>
              {atual.situacao === "SEM_PRAZO"
                ? "sem prazo"
                : prazoLegivel(atual.minutosRestantes)}
            </Etiqueta>
          </div>

          <p className="mt-2 text-lg font-semibold">
            {atual.cliente ?? "Cliente não informado"}
          </p>

          {(atual.endereco || atual.bairro) && (
            <p className="mt-1 flex items-start gap-1.5 text-sm text-[var(--texto-2)]">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                {atual.endereco}
                {atual.bairro?.nome ? ` — ${atual.bairro.nome}` : ""}
              </span>
            </p>
          )}

          {/* a ação vem logo em seguida — é o que a pessoa veio fazer aqui */}
          <div className="mt-3">
            <PassoDoAtendimento
              ordemId={atual.id}
              status={atual.status}
              latitude={atual.latitude}
              longitude={atual.longitude}
            />
          </div>

          {/* detalhe é leitura extra, não bloqueia quem só quer agir */}
          {(atual.descricao || atual.materiaisPrevistos.length > 0) && (
            <details className="mt-3 border-t border-[var(--borda)] pt-3">
              <summary className="cursor-pointer text-xs font-semibold text-[var(--texto-2)]">
                {rotuloDoTipo(tipos, atual.tipo)}
                {atual.titulo ? ` — ${atual.titulo}` : ""} · mais detalhes
              </summary>

              {atual.descricao && (
                <p className="mt-2 rounded-lg bg-[var(--superficie-2)] p-3 text-sm text-[var(--texto-2)]">
                  {atual.descricao}
                </p>
              )}

              {atual.materiaisPrevistos.length > 0 && (
                <div className="mt-2">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-[var(--texto-2)]">
                    <Package className="size-3.5" aria-hidden /> Material previsto
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {atual.materiaisPrevistos.map((previsto) => (
                      <li key={previsto.id}>
                        <Etiqueta tom="neutro">
                          {quantidade(
                            previsto.quantidade,
                            previsto.material.unidadeMedida,
                          )}{" "}
                          {previsto.material.nome}
                        </Etiqueta>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </details>
          )}
        </Cartao>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Cartao
            titulo={`Depois desta (${demais.length})`}
            descricao="Na ordem sugerida pelo roteiro."
            semPadding
          >
            {demais.length === 0 ? (
              <Vazio titulo="Nenhuma outra ordem em aberto" />
            ) : (
              <ul className="divide-y divide-[var(--borda)]">
                {demais.map((ordem) => {
                  const parada = roteiro?.paradas.find(
                    (p) => p.ordemId === ordem.id,
                  );
                  return (
                    <li key={ordem.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <Link
                            href={`/os/${ordem.id}`}
                            className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                          >
                            {ordem.numero}
                          </Link>
                          <span className="truncate text-sm">
                            {ordem.cliente ?? "Cliente não informado"}
                          </span>
                        </span>
                        {ordem.prioridade === "P1" && (
                          <Etiqueta tom={PRIORIDADE_OS.tom(ordem.prioridade)}>
                            {ordem.prioridade}
                          </Etiqueta>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[var(--texto-3)]">
                        <Etiqueta tom={SITUACAO_SLA.tom(ordem.situacao)}>
                          {ordem.situacao === "SEM_PRAZO"
                            ? "sem prazo"
                            : prazoLegivel(ordem.minutosRestantes)}
                        </Etiqueta>
                        {ordem.bairro?.nome ?? ordem.endereco ?? "sem endereço"}
                        {parada && ` · ${numero(parada.trechoKm, 1)} km`}
                        {parada && ` · chegada ~${hora(parada.chegadaPrevista)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Cartao>
        </div>

        {/* 1.8 — o que ele tem em posse agora */}
        <Cartao titulo="Meu material" semPadding>
          {posse.length === 0 ? (
            <Vazio
              titulo="Sem material em posse"
              descricao="Retire no estoque antes de sair."
            />
          ) : (
            <ul className="divide-y divide-[var(--borda)]">
              {posse.map((saldo) => (
                <li
                  key={saldo.id}
                  className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                >
                  <span className="min-w-0 truncate">{saldo.material.nome}</span>
                  <span className="tabular shrink-0 font-medium">
                    {quantidade(
                      saldo.quantidade - saldo.reservado,
                      saldo.material.unidadeMedida,
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </>
  );
}
