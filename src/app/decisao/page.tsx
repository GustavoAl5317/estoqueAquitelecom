import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PRIORIDADE_OS, STATUS_OS } from "@/lib/dominio";
import { rotuloDoTipo, todosTiposOS } from "@/lib/servicos/tipos-os";
import { painelDeDecisao } from "@/lib/servicos/decisao";
import { filaInteligente, leituraDaOperacao } from "@/lib/servicos/fila";
import { sugestoesDeRebalanceamento } from "@/lib/servicos/regioes";
import { minutosLegiveis } from "@/lib/servicos/eventos";
import { hora, numero } from "@/lib/utils";
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
import { AcaoRapida } from "@/components/formulario";
import { acaoAtribuirOrdem } from "@/app/acoes/operacao";

export const dynamic = "force-dynamic";

const TOM_RISCO = {
  ESTOURADO: "critico",
  VAI_ESTOURAR: "critico",
  APERTADO: "atencao",
  FOLGADO: "positivo",
  SEM_PRAZO: "neutro",
} as const;

const ROTULO_RISCO = {
  ESTOURADO: "Estourado",
  VAI_ESTOURAR: "Vai estourar",
  APERTADO: "Apertado",
  FOLGADO: "No prazo",
  SEM_PRAZO: "Sem prazo",
} as const;

/**
 * 4.10 — CENTRAL DE DECISÃO.
 *
 * O dashboard mostra como a operação está. A fila mostra o que atacar. Esta
 * tela responde o que fica no meio: **o que decidir agora e o que acontece se
 * ninguém decidir** — atraso previsto, OS sem dono e carga desequilibrada, na
 * mesma leitura.
 *
 * Como no resto do Bloco 4, nada aqui se resolve sozinho: cada linha termina
 * num botão que uma pessoa aperta.
 */
export default async function CentralDeDecisao() {
  const [painel, leitura, semDono, sugestoes, tipos] = await Promise.all([
    painelDeDecisao(),
    leituraDaOperacao(),
    filaInteligente({ limite: 12, somenteSemResponsavel: true }),
    sugestoesDeRebalanceamento(),
    todosTiposOS(),
  ]);

  const { resumo, emRisco } = painel;

  return (
    <>
      <CabecalhoPagina
        titulo="Central de decisão"
        descricao="O que vai estourar, quem está sem responsável e onde a carga desequilibrou — com a previsão de conclusão calculada a partir do deslocamento e do tempo médio de cada tipo de serviço."
        acoes={
          <>
            <BotaoLink href="/fila">Fila inteligente</BotaoLink>
            <BotaoLink href="/os/quadro?recorte=TECNICO" variante="primario">
              Quadro por técnico
            </BotaoLink>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metrica rotulo="OS abertas" valor={numero(resumo.abertas)} />
        <Metrica
          rotulo="Prazo estourado"
          valor={numero(resumo.estouradas)}
          tom={resumo.estouradas > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Vão estourar"
          valor={numero(resumo.vaoEstourar)}
          detalhe="pela previsão de conclusão"
          tom={resumo.vaoEstourar > 0 ? "critico" : "positivo"}
        />
        <Metrica
          rotulo="Apertadas"
          valor={numero(resumo.apertadas)}
          detalhe="menos de 30 min de folga"
          tom={resumo.apertadas > 0 ? "atencao" : "neutro"}
        />
        <Metrica
          rotulo="Sem responsável"
          valor={numero(resumo.semResponsavel)}
          tom={resumo.semResponsavel > 0 ? "atencao" : "positivo"}
          href="/fila?semResponsavel=1"
        />
      </div>

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

      {/* 3.56 */}
      <Cartao
        titulo="Previsão de atraso"
        descricao={
          resumo.semPrevisao > 0
            ? `${resumo.semPrevisao} OS ficam sem previsão de deslocamento — falta responsável, coordenada ou posição do técnico.`
            : "Conclusão prevista = deslocamento até o cliente + tempo médio de atendimento do tipo de serviço."
        }
        semPadding
        className="mb-4"
      >
        {emRisco.length === 0 ? (
          <Vazio
            titulo="Nenhuma OS em risco pela previsão"
            descricao="Todo atendimento aberto cabe no prazo com a folga atual."
          />
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th>OS</Th>
                <Th>Responsável</Th>
                <Th>Situação</Th>
                <Th numerico>Conclusão prevista</Th>
                <Th numerico>Folga</Th>
                <Th>Por quê</Th>
              </tr>
            </thead>
            <tbody>
              {emRisco.map((previsao) => (
                <Linha key={previsao.ordemId}>
                  <Td>
                    <Link
                      href={`/os/${previsao.ordemId}`}
                      className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                    >
                      {previsao.numero}
                    </Link>
                    <span className="block text-xs text-[var(--texto-3)]">
                      {previsao.cliente ?? "cliente não informado"}
                      {previsao.bairro ? ` · ${previsao.bairro}` : ""}
                    </span>
                  </Td>
                  <Td>
                    {previsao.tecnico?.nome ?? (
                      <span className="text-[var(--atencao)]">sem responsável</span>
                    )}
                    <span className="block text-xs text-[var(--texto-3)]">
                      {rotuloDoTipo(tipos, previsao.tipo)} ·{" "}
                      {STATUS_OS.rotulo(previsao.status)}
                    </span>
                  </Td>
                  <Td>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Etiqueta tom={TOM_RISCO[previsao.risco]}>
                        {ROTULO_RISCO[previsao.risco]}
                      </Etiqueta>
                      <Etiqueta tom={PRIORIDADE_OS.tom(previsao.prioridade)}>
                        {previsao.prioridade}
                      </Etiqueta>
                    </span>
                  </Td>
                  <Td numerico>
                    {previsao.conclusaoPrevista
                      ? hora(previsao.conclusaoPrevista)
                      : "—"}
                    {previsao.prazo && (
                      <span className="block text-xs text-[var(--texto-3)]">
                        prazo {hora(previsao.prazo)}
                      </span>
                    )}
                  </Td>
                  <Td numerico>
                    {previsao.folgaMinutos === null ? (
                      "—"
                    ) : (
                      <span
                        className={
                          previsao.folgaMinutos < 0
                            ? "font-medium text-[var(--critico)]"
                            : ""
                        }
                      >
                        {previsao.folgaMinutos < 0 ? "−" : "+"}
                        {minutosLegiveis(Math.abs(previsao.folgaMinutos))}
                      </span>
                    )}
                  </Td>
                  <Td className="max-w-[22rem] text-xs text-[var(--texto-3)]">
                    {previsao.motivo}
                  </Td>
                </Linha>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 4.7 */}
        <Cartao
          titulo="Sem responsável — recomendação"
          descricao="O técnico com melhor score para cada OS parada. Atribuir é um clique; discordar também."
        >
          {semDono.length === 0 ? (
            <Vazio
              titulo="Nenhuma OS sem responsável"
              descricao="Toda ordem aberta já tem quem responda por ela."
            />
          ) : (
            <div className="space-y-3">
              {semDono.map((item) => {
                const melhor = item.candidatos[0];
                return (
                  <div
                    key={item.ordemId}
                    className="rounded-lg border border-[var(--borda)] p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/os/${item.ordemId}`}
                        className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                      >
                        {item.numero}
                      </Link>
                      <Etiqueta tom={PRIORIDADE_OS.tom(item.prioridade)}>
                        {item.prioridade}
                      </Etiqueta>
                    </div>

                    <p className="mt-1 text-sm">
                      {item.cliente ?? "Cliente não informado"}
                      {item.bairro && (
                        <span className="text-[var(--texto-3)]"> · {item.bairro}</span>
                      )}
                    </p>

                    {melhor ? (
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-[var(--texto-2)]">
                          <strong>{melhor.tecnicoNome}</strong> · score{" "}
                          {melhor.score} · {melhor.motivos.slice(0, 2).join(" · ")}
                        </span>
                        <AcaoRapida
                          acao={acaoAtribuirOrdem}
                          campos={{
                            ordemId: item.ordemId,
                            tecnicoId: melhor.tecnicoId,
                          }}
                          variante="primario"
                        >
                          Atribuir
                        </AcaoRapida>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs text-[var(--atencao)]">
                        {item.impedimento ?? "Sem candidato no momento."}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Cartao>

        {/* 3.46 / 3.57 */}
        <Cartao
          titulo="Rebalanceamento"
          descricao="Desequilíbrios de cobertura e de carga que custam prazo mais adiante."
        >
          {sugestoes.length === 0 ? (
            <Vazio
              titulo="Nada a rebalancear"
              descricao="Toda área tem responsável e a carga está distribuída."
            />
          ) : (
            <div className="space-y-2">
              {sugestoes.map((sugestao, indice) => (
                <Aviso
                  key={`${sugestao.tipo}-${indice}`}
                  tom={sugestao.tom}
                  titulo={sugestao.titulo}
                >
                  {sugestao.detalhe}{" "}
                  <Link
                    href={sugestao.href}
                    className="font-medium underline underline-offset-2"
                  >
                    resolver
                  </Link>
                </Aviso>
              ))}
            </div>
          )}
        </Cartao>
      </div>
    </>
  );
}
