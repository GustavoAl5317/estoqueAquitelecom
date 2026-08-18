import Link from "next/link";
import { AlertTriangle, List, Repeat } from "lucide-react";
import { exigir } from "@/lib/sessao";
import { SEVERIDADE_OS, STATUS_OS_ABERTOS, TIPO_OS } from "@/lib/dominio";
import { listarOrdens } from "@/lib/servicos/ordens";
import { analisePrimaria } from "@/lib/servicos/incidentes";
import { severidadeEfetiva } from "@/lib/servicos/severidade";
import { minutosLegiveis } from "@/lib/servicos/eventos";
import { dataHora, numero, tempoRelativo } from "@/lib/utils";
import {
  Aviso,
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
import { MapaOrdens, type OrdemNoMapa } from "@/components/mapa-ordens";

export const dynamic = "force-dynamic";

/**
 * 2.26 a 2.32 — MAPA E CONCENTRAÇÃO.
 *
 * A tela que responde "onde os problemas estão acontecendo". O mapa mostra a
 * distribuição; os painéis abaixo mostram o que essa distribuição pode
 * significar — e deixam claro que são hipóteses.
 */
export default async function MapaDeOrdens() {
  await exigir("os.ver");

  const [ordens, analise] = await Promise.all([
    listarOrdens({ status: STATUS_OS_ABERTOS, limite: 500 }),
    analisePrimaria(),
  ]);

  const noMapa: OrdemNoMapa[] = ordens
    .filter((o) => o.latitude !== null && o.longitude !== null)
    .map((o) => {
      const severidade = severidadeEfetiva(o, {
        vizinhas: analise.concentracoes.find((c) => c.bairroId === o.bairroId)
          ?.total,
      });
      return {
        id: o.id,
        numero: o.numero,
        cliente: o.cliente,
        endereco: o.endereco,
        bairro: o.bairro?.nome ?? o.bairroNome,
        tipo: o.tipo,
        severidade: severidade.efetiva,
        prioridade: o.prioridade,
        latitude: o.latitude!,
        longitude: o.longitude!,
        emRisco: o.situacao === "ESTOURADO" || o.situacao === "ATENCAO",
      };
    });

  const semCoordenada = ordens.length - noMapa.length;

  return (
    <>
      <CabecalhoPagina
        titulo="Mapa das ordens"
        descricao="Onde os problemas estão acontecendo — e o que a concentração deles pode significar."
        acoes={
          <>
            <BotaoLink href="/os">
              <List className="size-4" aria-hidden /> Lista
            </BotaoLink>
            <BotaoLink href="/os/quadro">Quadro</BotaoLink>
          </>
        }
      />

      {/* 2.24 */}
      <Cartao titulo="Leitura da operação" className="mb-4">
        <div className="space-y-2">
          {analise.frases.map((frase, i) => (
            <Aviso key={i} tom={frase.tom}>
              {frase.texto}
            </Aviso>
          ))}
        </div>
      </Cartao>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="No mapa" valor={numero(noMapa.length)} />
        <Metrica
          rotulo="Sem coordenada"
          valor={numero(semCoordenada)}
          tom={semCoordenada > 0 ? "atencao" : "positivo"}
        />
        <Metrica
          rotulo="Possíveis incidentes"
          valor={numero(analise.incidentes.length)}
          tom={analise.incidentes.length > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Clientes reincidentes"
          valor={numero(analise.repetidos.length)}
          tom={analise.repetidos.length > 0 ? "atencao" : "positivo"}
        />
      </div>

      <Cartao titulo="Distribuição" className="mb-4">
        <MapaOrdens ordens={noMapa} />
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2.27 / 2.28 */}
        <Cartao
          titulo={
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" aria-hidden /> Possíveis incidentes
            </span>
          }
          descricao="Hipóteses. Confirmar é decisão de quem conhece a rede."
          semPadding
        >
          {analise.incidentes.length === 0 ? (
            <Vazio
              titulo="Nenhum agrupamento suspeito"
              descricao="São necessárias 5 OS do mesmo tipo, num raio de 1,2 km, abertas em até 3 h."
            />
          ) : (
            <ul className="divide-y divide-[var(--borda)]">
              {analise.incidentes.map((incidente) => (
                <li key={incidente.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Etiqueta
                      tom={incidente.confianca === "ALTA" ? "critico" : "atencao"}
                    >
                      confiança {incidente.confianca === "ALTA" ? "alta" : "média"}
                    </Etiqueta>
                    <span className="text-sm font-medium">
                      {incidente.ordens.length} OS de{" "}
                      {TIPO_OS.rotulo(incidente.tipo).toLowerCase()}
                    </span>
                    {incidente.bairro && (
                      <span className="text-xs text-[var(--texto-3)]">
                        {incidente.bairro}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-[var(--texto-3)]">
                    Raio de {numero(incidente.raioKm, 2)} km ·{" "}
                    {minutosLegiveis(incidente.minutosDeJanela)} entre a primeira e
                    a última · desde {dataHora(incidente.primeira)}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {incidente.ordens.slice(0, 8).map((ordem) => (
                      <Link
                        key={ordem.id}
                        href={`/os/${ordem.id}`}
                        className="font-mono text-[11px] text-[var(--acento)] hover:underline"
                      >
                        {ordem.numero}
                      </Link>
                    ))}
                    {incidente.ordens.length > 8 && (
                      <span className="text-[11px] text-[var(--texto-3)]">
                        +{incidente.ordens.length - 8}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* 2.25 */}
        <Cartao
          titulo={
            <span className="flex items-center gap-1.5">
              <Repeat className="size-3.5" aria-hidden /> Clientes reincidentes
            </span>
          }
          descricao="Três ou mais OS em 30 dias — problema que não foi resolvido."
          semPadding
        >
          {analise.repetidos.length === 0 ? (
            <Vazio titulo="Nenhuma reincidência relevante" />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th numerico>OS</Th>
                  <Th numerico>Abertas</Th>
                  <Th>Tipos</Th>
                  <Th>Última</Th>
                </tr>
              </thead>
              <tbody>
                {analise.repetidos.slice(0, 12).map((cliente) => (
                  <Linha key={cliente.chave}>
                    <Td>
                      <span className="text-sm font-medium">{cliente.cliente}</span>
                      {cliente.contrato && (
                        <span className="block text-xs text-[var(--texto-3)]">
                          contrato {cliente.contrato}
                        </span>
                      )}
                    </Td>
                    <Td numerico className="font-semibold">
                      {cliente.ordens}
                    </Td>
                    <Td numerico>
                      {cliente.abertas > 0 ? (
                        <Etiqueta tom="atencao">{cliente.abertas}</Etiqueta>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td className="text-xs">
                      {cliente.tipos
                        .slice(0, 2)
                        .map((t) => `${TIPO_OS.rotulo(t.tipo)} (${t.quantidade})`)
                        .join(", ")}
                    </Td>
                    <Td className="text-xs text-[var(--texto-3)]">
                      {tempoRelativo(cliente.ultimaEm)}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        {/* 2.26 */}
        <Cartao
          titulo="Concentração por bairro"
          descricao="Últimas 6 horas, apenas ordens ainda abertas."
          semPadding
          className="lg:col-span-2"
        >
          {analise.concentracoes.length === 0 ? (
            <Vazio titulo="Demanda distribuída" />
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <Th>Bairro</Th>
                  <Th numerico>OS abertas</Th>
                  <Th>Tipo predominante</Th>
                  <Th numerico>Técnicos na região</Th>
                  <Th>Janela</Th>
                </tr>
              </thead>
              <tbody>
                {analise.concentracoes.map((c) => (
                  <Linha key={c.bairro}>
                    <Td className="text-sm font-medium">{c.bairro}</Td>
                    <Td numerico className="font-semibold">
                      {c.total}
                    </Td>
                    <Td className="text-sm">
                      {TIPO_OS.rotulo(c.tipoPredominante)}{" "}
                      <span className="text-xs text-[var(--texto-3)]">
                        ({c.doTipo})
                      </span>
                    </Td>
                    <Td numerico>
                      {c.tecnicosNaRegiao === 0 ? (
                        <Etiqueta tom="critico">nenhum</Etiqueta>
                      ) : (
                        c.tecnicosNaRegiao
                      )}
                    </Td>
                    <Td className="text-xs text-[var(--texto-3)]">
                      {tempoRelativo(c.primeira)} → {tempoRelativo(c.ultima)}
                    </Td>
                  </Linha>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>
      </div>

      {semCoordenada > 0 && (
        <div className="mt-4">
          <Aviso tom="atencao" titulo={`${semCoordenada} OS fora do mapa`}>
            Sem latitude e longitude a ordem não entra na análise de concentração
            nem na detecção de incidente. Informe a coordenada na tela da OS.
          </Aviso>
        </div>
      )}
    </>
  );
}
