import Link from "next/link";
import { Route } from "lucide-react";
import { PRIORIDADE_OS, SITUACAO_SLA, TIPO_OS } from "@/lib/dominio";
import { economiaDoRoteiro, roteirosDoDia } from "@/lib/servicos/roteiro";
import { prazoLegivel } from "@/lib/servicos/ordens";
import { hora, numero } from "@/lib/utils";
import {
  Aviso,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";
import { MapaRuas, type PontoMapaRua } from "@/components/mapa-ruas";

export const dynamic = "force-dynamic";

function minutosLegiveis(minutos: number) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return horas ? `${horas}h${resto ? ` ${resto}min` : ""}` : `${resto}min`;
}

/**
 * 3.31 / 3.32 — ROTEIRIZAÇÃO.
 *
 * A ordem de visita sugerida para cada técnico, com a economia de deslocamento
 * em relação a atender na ordem em que as OS chegaram. O supervisor continua
 * livre para ignorar — a sugestão não move nada sozinha.
 */
export default async function Roteiros() {
  const roteiros = await roteirosDoDia();

  const totalKm = roteiros.reduce((s, r) => s + r.totalKm, 0);
  const totalParadas = roteiros.reduce((s, r) => s + r.paradas.length, 0);
  const semCoordenada = roteiros.reduce((s, r) => s + r.semCoordenada.length, 0);

  const economias = roteiros
    .map((r) => economiaDoRoteiro(r))
    .filter((e): e is NonNullable<typeof e> => e !== null);
  const economiaTotal = economias.reduce((s, e) => s + e.economiaKm, 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Roteiro do dia"
        descricao="Em que ordem atender. Não é traçado de rua — é sequência de visitas, calculada pela posição atual do técnico e pela urgência de cada OS."
        acoes={<BotaoLink href="/os/quadro">Ver quadro</BotaoLink>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Roteiros" valor={numero(roteiros.length)} />
        <Metrica rotulo="Paradas" valor={numero(totalParadas)} />
        <Metrica
          rotulo="Distância total"
          valor={`${numero(totalKm, 1)} km`}
          detalhe="em linha reta"
        />
        <Metrica
          rotulo="Economia estimada"
          valor={`${numero(economiaTotal, 1)} km`}
          tom={economiaTotal > 0 ? "positivo" : "neutro"}
          detalhe="vs. ordem de chegada"
        />
      </div>

      {semCoordenada > 0 && (
        <div className="mb-4">
          <Aviso tom="atencao" titulo={`${semCoordenada} OS fora do roteiro`}>
            Sem latitude e longitude não dá para calcular distância. Informe a
            coordenada na tela da OS para que ela entre na sequência.
          </Aviso>
        </div>
      )}

      {roteiros.length === 0 ? (
        <Cartao semPadding>
          <Vazio
            titulo="Nenhum roteiro para montar"
            descricao="Roteiro exige OS atribuída a um técnico com veículo reportando posição."
            acao={<BotaoLink href="/fila">Ir para a fila</BotaoLink>}
          />
        </Cartao>
      ) : (
        <div className="space-y-4">
          {roteiros.map((roteiro) => {
            const economia = economiaDoRoteiro(roteiro);

            const pontos: PontoMapaRua[] = [
              ...(roteiro.partida
                ? [
                    {
                      id: `partida-${roteiro.tecnicoId}`,
                      rotulo: roteiro.tecnicoNome,
                      detalhe: "partida",
                      latitude: roteiro.partida.latitude,
                      longitude: roteiro.partida.longitude,
                      cor: "var(--positivo)",
                    },
                  ]
                : []),
              ...roteiro.paradas.map<PontoMapaRua>((parada, indice) => ({
                id: parada.ordemId,
                rotulo: `${indice + 1}. ${parada.numero}`,
                detalhe: parada.cliente ?? undefined,
                latitude: parada.latitude,
                longitude: parada.longitude,
                cor:
                  parada.situacao === "ESTOURADO"
                    ? "var(--critico)"
                    : parada.situacao === "ATENCAO"
                      ? "var(--atencao)"
                      : "var(--acento)",
                href: `/os/${parada.ordemId}`,
              })),
            ];

            return (
              <Cartao
                key={roteiro.tecnicoId}
                titulo={
                  <span className="flex items-center gap-1.5">
                    <Route className="size-3.5" aria-hidden /> {roteiro.tecnicoNome}
                  </span>
                }
                descricao={
                  <>
                    {roteiro.paradas.length} parada(s) ·{" "}
                    {numero(roteiro.totalKm, 1)} km ·{" "}
                    {minutosLegiveis(
                      roteiro.minutosDeslocamento + roteiro.minutosAtendimento,
                    )}{" "}
                    de jornada
                    {roteiro.fimPrevisto && (
                      <> · termina por volta de {hora(roteiro.fimPrevisto)}</>
                    )}
                  </>
                }
                acoes={
                  economia && economia.economiaKm > 0 ? (
                    <Etiqueta tom="positivo">
                      −{numero(economia.economiaKm, 1)} km ({economia.economiaPercentual}%)
                    </Etiqueta>
                  ) : roteiro.fonte ? (
                    <Etiqueta tom={roteiro.fonte === "CELULAR" ? "roxo" : "neutro"}>
                      {roteiro.fonte === "CELULAR" ? "pelo celular" : "pelo veículo"}
                    </Etiqueta>
                  ) : undefined
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <ol className="space-y-2">
                    {roteiro.partida && (
                      <li className="flex gap-2.5 text-sm">
                        <span
                          className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                          style={{
                            background: "var(--positivo-suave)",
                            color: "var(--positivo)",
                          }}
                        >
                          ●
                        </span>
                        <span className="text-[var(--texto-2)]">
                          Partida — {roteiro.partida.descricao}
                        </span>
                      </li>
                    )}

                    {roteiro.paradas.map((parada, indice) => (
                      <li key={parada.ordemId} className="flex gap-2.5">
                        <span
                          className="tabular mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                          style={{
                            background: "var(--acento-suave)",
                            color: "var(--acento-texto)",
                          }}
                        >
                          {indice + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Link
                              href={`/os/${parada.ordemId}`}
                              className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                            >
                              {parada.numero}
                            </Link>
                            <Etiqueta tom={PRIORIDADE_OS.tom(parada.prioridade)}>
                              {parada.prioridade}
                            </Etiqueta>
                            <Etiqueta tom={SITUACAO_SLA.tom(parada.situacao)}>
                              {parada.situacao === "SEM_PRAZO"
                                ? "sem prazo"
                                : prazoLegivel(parada.minutosRestantes)}
                            </Etiqueta>
                          </div>
                          <p className="truncate text-sm">
                            {parada.cliente ?? "Cliente não informado"}
                            <span className="ml-1.5 text-xs text-[var(--texto-3)]">
                              {TIPO_OS.rotulo(parada.tipo)}
                            </span>
                          </p>
                          <p className="text-xs text-[var(--texto-3)]">
                            {parada.bairro ?? parada.endereco ?? "sem endereço"} ·{" "}
                            {numero(parada.trechoKm, 1)} km · chegada ~
                            {hora(parada.chegadaPrevista)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div>
                    <MapaRuas pontos={pontos} altura={320} />
                    {roteiro.semCoordenada.length > 0 && (
                      <p className="mt-2 text-xs text-[var(--atencao)]">
                        Fora do roteiro por falta de coordenada:{" "}
                        {roteiro.semCoordenada.map((o) => o.numero).join(", ")}
                      </p>
                    )}
                  </div>
                </div>
              </Cartao>
            );
          })}
        </div>
      )}
    </>
  );
}
