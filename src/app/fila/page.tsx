import Link from "next/link";
import { MapPin, Sparkles } from "lucide-react";
import {
  PRIORIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS,
  TIPO_OS,
} from "@/lib/dominio";
import { filaInteligente, leituraDaOperacao } from "@/lib/servicos/fila";
import { prazoLegivel } from "@/lib/servicos/ordens";
import { parametros, somaDosPesos } from "@/lib/servicos/parametros";
import { visoesParaTela } from "@/lib/servicos/visoes";
import { usuarioAtual } from "@/lib/sessao";
import { numero, queryDeFiltros, tempoRelativo } from "@/lib/utils";
import {
  Aviso,
  BotaoLink,
  CabecalhoPagina,
  Cartao,
  Etiqueta,
  Metrica,
  Vazio,
} from "@/components/ui";
import { AcaoRapida } from "@/components/formulario";
import { VisoesSalvas } from "@/components/visoes-salvas";
import { acaoAtribuirOrdem } from "@/app/acoes/operacao";

export const dynamic = "force-dynamic";

/**
 * BLOCO 4 — FILA INTELIGENTE.
 *
 * A tela responde "o que atacar agora e com quem". Nada é atribuído sozinho:
 * cada recomendação vira um botão, com os motivos escritos ao lado, e a decisão
 * continua sendo de quem responde pela operação.
 */
export default async function Fila({
  searchParams,
}: {
  searchParams: Promise<{ semResponsavel?: string }>;
}) {
  const { semResponsavel } = await searchParams;
  const somenteSemResponsavel = semResponsavel === "1";

  const usuario = await usuarioAtual();

  const [fila, leitura, config, visoes] = await Promise.all([
    filaInteligente({ limite: 40, somenteSemResponsavel }),
    leituraDaOperacao(),
    parametros(),
    visoesParaTela("/fila", usuario.id),
  ]);

  const comRecomendacao = fila.filter((i) => i.candidatos.length > 0).length;
  const impedidas = fila.filter((i) => i.impedimento).length;

  return (
    <>
      <CabecalhoPagina
        titulo="Fila inteligente"
        descricao="As OS abertas ordenadas por urgência, com o técnico recomendado e o motivo da recomendação."
        acoes={
          <>
            <BotaoLink
              href={somenteSemResponsavel ? "/fila" : "/fila?semResponsavel=1"}
              variante={somenteSemResponsavel ? "primario" : "secundario"}
            >
              Só sem responsável
            </BotaoLink>
            <BotaoLink href="/central">Ajustar pesos</BotaoLink>
          </>
        }
      />

      <Cartao className="mb-4">
        <VisoesSalvas
          tela="/fila"
          filtrosAtuais={queryDeFiltros({ semResponsavel })}
          visoes={visoes}
        />
      </Cartao>

      {/* 4.10 */}
      <Cartao
        titulo={
          <span className="flex items-center gap-1.5">
            <Sparkles className="size-3.5" aria-hidden /> Leitura da operação
          </span>
        }
        className="mb-4"
      >
        <div className="space-y-2">
          {leitura.frases.map((frase, indice) => (
            <Aviso key={indice} tom={frase.tom}>
              {frase.texto}
            </Aviso>
          ))}
        </div>
      </Cartao>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metrica rotulo="Na fila" valor={numero(fila.length)} />
        <Metrica
          rotulo="Com recomendação"
          valor={numero(comRecomendacao)}
          tom={comRecomendacao > 0 ? "positivo" : "neutro"}
        />
        <Metrica
          rotulo="Sem como recomendar"
          valor={numero(impedidas)}
          tom={impedidas > 0 ? "atencao" : "neutro"}
          detalhe="falta coordenada ou posição"
        />
        <Metrica
          rotulo="Soma dos pesos"
          valor={numero(somaDosPesos(config))}
          detalhe="configurável na Central"
          href="/central"
        />
      </div>

      {fila.length === 0 ? (
        <Cartao semPadding>
          <Vazio
            titulo="Nenhuma OS na fila"
            descricao={
              somenteSemResponsavel
                ? "Todas as OS abertas já têm responsável."
                : "Não há ordem de serviço aberta no momento."
            }
            acao={<BotaoLink href="/os/nova">Nova OS</BotaoLink>}
          />
        </Cartao>
      ) : (
        <ul className="space-y-3">
          {fila.map((item, posicao) => (
            <li key={item.ordemId}>
              <Cartao>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className="tabular grid size-8 shrink-0 place-items-center rounded-lg text-sm font-semibold"
                    style={{
                      background: "var(--superficie-3)",
                      color: "var(--texto-2)",
                    }}
                    aria-hidden
                  >
                    {posicao + 1}
                  </span>

                  <div className="min-w-52 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/os/${item.ordemId}`}
                        className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                      >
                        {item.numero}
                      </Link>
                      <Etiqueta tom={PRIORIDADE_OS.tom(item.prioridade)}>
                        {item.prioridade}
                      </Etiqueta>
                      <Etiqueta tom={STATUS_OS.tom(item.status)} ponto>
                        {STATUS_OS.rotulo(item.status)}
                      </Etiqueta>
                      <Etiqueta tom={SITUACAO_SLA.tom(item.situacao)}>
                        {item.situacao === "SEM_PRAZO"
                          ? "sem prazo"
                          : prazoLegivel(item.minutosRestantes)}
                      </Etiqueta>
                    </div>

                    <p className="mt-1 text-sm font-medium">
                      {item.cliente ?? "Cliente não informado"}
                      <span className="ml-2 text-xs font-normal text-[var(--texto-3)]">
                        {TIPO_OS.rotulo(item.tipo)}
                      </span>
                    </p>

                    <p className="flex flex-wrap items-center gap-1 text-xs text-[var(--texto-3)]">
                      {(item.bairro || item.endereco) && (
                        <>
                          <MapPin className="size-3" aria-hidden />
                          {item.bairro ?? item.endereco}
                          <span aria-hidden>·</span>
                        </>
                      )}
                      aberta {tempoRelativo(item.abertaEm)}
                      {item.responsavelAtual && (
                        <>
                          <span aria-hidden>·</span>
                          com {item.responsavelAtual.nome}
                        </>
                      )}
                    </p>

                    {item.materiais.length > 0 && (
                      <p className="mt-1 text-xs text-[var(--texto-3)]">
                        Precisa de:{" "}
                        {item.materiais
                          .map((m) => `${numero(m.quantidade, 2)}× ${m.nome}`)
                          .join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="text-right">
                    <span className="block text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                      Urgência
                    </span>
                    <span className="tabular text-xl font-semibold">
                      {item.urgencia}
                    </span>
                  </div>
                </div>

                {/* 4.7 — a recomendação, sempre com o porquê */}
                <div className="mt-3 border-t border-[var(--borda)] pt-3">
                  {item.impedimento ? (
                    <Aviso tom="atencao">{item.impedimento}</Aviso>
                  ) : (
                    <ul className="grid gap-2 md:grid-cols-3">
                      {item.candidatos.map((candidato, indice) => (
                        <li
                          key={candidato.tecnicoId}
                          className="rounded-lg border p-2.5"
                          style={{
                            borderColor:
                              indice === 0 ? "var(--acento)" : "var(--borda)",
                            background:
                              indice === 0 ? "var(--acento-suave)" : undefined,
                          }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-sm font-medium">
                              {candidato.tecnicoNome}
                            </span>
                            <span className="tabular text-sm font-semibold">
                              {candidato.score}
                            </span>
                          </div>

                          <p className="text-xs text-[var(--texto-3)]">
                            {candidato.referencia} ·{" "}
                            {numero(candidato.distanciaKm, 1)} km ·{" "}
                            {candidato.osAbertas} OS
                          </p>

                          <ul className="mt-1.5 space-y-0.5">
                            {candidato.motivos.map((motivo) => (
                              <li
                                key={motivo}
                                className="text-[11px] leading-snug text-[var(--texto-2)]"
                              >
                                • {motivo}
                              </li>
                            ))}
                          </ul>

                          {item.responsavelAtual?.id !== candidato.tecnicoId && (
                            <div className="mt-2">
                              <AcaoRapida
                                acao={acaoAtribuirOrdem}
                                variante={indice === 0 ? "primario" : "secundario"}
                                campos={{
                                  ordemId: item.ordemId,
                                  tecnicoId: candidato.tecnicoId,
                                  observacao: `Recomendação da fila (score ${candidato.score}).`,
                                }}
                              >
                                Atribuir
                              </AcaoRapida>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
