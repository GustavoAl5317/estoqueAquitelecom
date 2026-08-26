"use client";

import {
  acaoAlternarDistribuicaoAutomatica,
  acaoAlternarNotificacaoSgp,
  acaoDistribuirAgora,
  acaoSalvarDistribuicaoTecnico,
} from "@/app/acoes/operacao";
import { FormularioAcao, BotaoEnviar } from "./formulario";
import { Aviso, Etiqueta } from "./ui";

export type TecnicoDistribuicao = {
  id: string;
  nome: string;
  recebeAutomatico: boolean;
  tiposAtendidos: string[];
  loginSgp: string | null;
  /** o nome que o SGP já mandou para este técnico, para sugerir o login */
  nomeNoSgp: string | null;
};

export type TipoDisponivel = { id: string; rotulo: string };

/**
 * 4.11 — QUEM RECEBE O QUÊ.
 *
 * A tela é a regra escrita por extenso, porque a regra tem duas metades que se
 * conversam e ninguém acerta isso de cabeça: designar alguém a um tipo o torna
 * exclusivo daquele tipo **e** o tira do rodízio dos demais. Em vez de explicar
 * isso num texto de ajuda, a tela mostra o resultado — a mesma frase que a
 * operação usaria para descrever o combinado.
 */
export function DistribuicaoDeTecnicos({
  tecnicos,
  tipos,
  ligada,
  escreveNoSgp,
}: {
  tecnicos: TecnicoDistribuicao[];
  tipos: TipoDisponivel[];
  ligada: boolean;
  escreveNoSgp: boolean;
}) {
  const noRodizio = tecnicos.filter(
    (t) => t.recebeAutomatico && t.tiposAtendidos.length === 0,
  );
  const foraDoRodizio = tecnicos.filter((t) => !t.recebeAutomatico);

  const porTipo = tipos.map((tipo) => ({
    ...tipo,
    donos: tecnicos.filter(
      (t) => t.recebeAutomatico && t.tiposAtendidos.includes(tipo.id),
    ),
  }));
  const exclusivos = porTipo.filter((t) => t.donos.length > 0);

  return (
    <div className="space-y-5">
      {/*
        A chave geral vem antes da regra: de nada adianta acertar quem recebe o
        quê se a automação está desligada, e esse é o tipo de detalhe que faz
        alguém passar meia hora conferindo cadastro à toa.
      */}
      <FormularioAcao
        acao={acaoAlternarDistribuicaoAutomatica}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--borda)] p-3"
      >
        <input type="hidden" name="ligar" value={ligada ? "0" : "1"} />
        <span className="flex items-center gap-2 text-sm">
          <Etiqueta tom={ligada ? "positivo" : "neutro"} ponto>
            {ligada ? "ligada" : "desligada"}
          </Etiqueta>
          {ligada
            ? "A OS que chega do SGP sem responsável já sai com um."
            : "As OS continuam chegando sem responsável até alguém distribuir."}
        </span>
        <BotaoEnviar variante={ligada ? "sutil" : "primario"}>
          {ligada ? "Desligar" : "Ligar distribuição automática"}
        </BotaoEnviar>
      </FormularioAcao>

      {/*
        Segunda chave, separada da primeira: uma decide quem atende, a outra
        escreve no sistema do cliente. Ligar as duas de uma vez esconderia
        qual delas causou o quê.
      */}
      <FormularioAcao
        acao={acaoAlternarNotificacaoSgp}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--borda)] p-3"
      >
        <input type="hidden" name="ligar" value={escreveNoSgp ? "0" : "1"} />
        <span className="flex items-center gap-2 text-sm">
          <Etiqueta tom={escreveNoSgp ? "positivo" : "neutro"} ponto>
            {escreveNoSgp ? "escreve no SGP" : "não escreve no SGP"}
          </Etiqueta>
          {escreveNoSgp
            ? "Cada atribuição grava o responsável na OS do SGP."
            : "A atribuição fica só aqui; a OS no SGP continua sem responsável."}
        </span>
        <BotaoEnviar variante={escreveNoSgp ? "sutil" : "primario"}>
          {escreveNoSgp ? "Desligar" : "Ligar escrita no SGP"}
        </BotaoEnviar>
      </FormularioAcao>

      {escreveNoSgp && tecnicos.some((t) => !t.loginSgp && !t.nomeNoSgp) && (
        <Aviso tom="atencao" titulo="Técnico sem login do SGP">
          {tecnicos
            .filter((t) => !t.loginSgp && !t.nomeNoSgp)
            .map((t) => t.nome)
            .join(", ")}{" "}
          — as OS destes não vão aparecer com responsável no SGP. Preencha o
          login de cada um abaixo.
        </Aviso>
      )}

      {/* o resumo primeiro: é o que se confere antes de mexer */}
      <div className="rounded-lg bg-[var(--superficie-2)] p-3 text-sm">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--texto-3)]">
          Como está hoje
        </p>

        {exclusivos.map((tipo) => (
          <p key={tipo.id} className="mb-1">
            <strong>{tipo.rotulo}</strong> → só{" "}
            {tipo.donos.map((d) => d.nome).join(", ")}
          </p>
        ))}

        <p className="mb-1">
          <strong>Demais tipos</strong> →{" "}
          {noRodizio.length
            ? noRodizio.map((t) => t.nome).join(", ")
            : "ninguém — nenhuma OS será distribuída"}
        </p>

        {foraDoRodizio.length > 0 && (
          <p className="text-[var(--texto-2)]">
            Fora do rodízio: {foraDoRodizio.map((t) => t.nome).join(", ")}
          </p>
        )}
      </div>

      {noRodizio.length === 0 && (
        <Aviso tom="atencao" titulo="Ninguém no rodízio geral">
          Toda OS que não for de um tipo com dono definido vai continuar sem
          responsável. Deixe pelo menos um técnico marcado como &quot;recebe OS
          automaticamente&quot; e sem nenhum tipo específico.
        </Aviso>
      )}

      <ul className="divide-y divide-[var(--borda)]">
        {tecnicos.map((tecnico) => (
          <li key={tecnico.id} className="py-3">
            <FormularioAcao
              acao={acaoSalvarDistribuicaoTecnico}
              aoConcluir={<Aviso tom="positivo">Distribuição atualizada.</Aviso>}
            >
              <input type="hidden" name="tecnicoId" value={tecnico.id} />

              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{tecnico.nome}</span>
                {tecnico.recebeAutomatico ? (
                  <Etiqueta tom={tecnico.tiposAtendidos.length ? "roxo" : "positivo"}>
                    {tecnico.tiposAtendidos.length
                      ? "especialista"
                      : "rodízio geral"}
                  </Etiqueta>
                ) : (
                  <Etiqueta tom="neutro">não recebe</Etiqueta>
                )}
              </div>

              <label className="mb-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="recebeAutomatico"
                  defaultChecked={tecnico.recebeAutomatico}
                  className="size-4"
                />
                Recebe OS automaticamente
              </label>

              <p className="mb-1.5 text-xs text-[var(--texto-3)]">
                Tipos que atende — deixe tudo desmarcado para ele ficar no
                rodízio geral:
              </p>
              <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {tipos.map((tipo) => (
                  <label
                    key={tipo.id}
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="tipos"
                      value={tipo.id}
                      defaultChecked={tecnico.tiposAtendidos.includes(tipo.id)}
                      className="size-4"
                    />
                    {tipo.rotulo}
                  </label>
                ))}
              </div>

              {/*
                2.32 — o SGP grava por login, não por nome. Mandar "Igor" onde
                ele espera "igor" devolve "Técnico não localizado" e a OS fica
                sem responsável lá, em silêncio. O placeholder mostra o palpite
                que o sistema usaria; digitar aqui é o que torna isso certo.
              */}
              <label className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                Login no SGP
                <input
                  type="text"
                  name="loginSgp"
                  defaultValue={tecnico.loginSgp ?? ""}
                  placeholder={tecnico.nomeNoSgp?.toLowerCase() ?? "ex.: igor"}
                  className="rounded-lg border border-[var(--borda-forte)] px-2 py-1 text-sm"
                />
                {!tecnico.loginSgp && tecnico.nomeNoSgp && (
                  <span className="text-xs text-[var(--texto-3)]">
                    sem cadastro — seria tentado &quot;{tecnico.nomeNoSgp.toLowerCase()}&quot;
                  </span>
                )}
              </label>

              <BotaoEnviar variante="secundario">Salvar</BotaoEnviar>
            </FormularioAcao>
          </li>
        ))}
      </ul>

      <div className="border-t border-[var(--borda)] pt-4">
        <p className="mb-2 text-sm text-[var(--texto-2)]">
          A regra acima vale para as OS que chegarem do SGP. As que já estão
          abertas sem responsável precisam de um empurrão:
        </p>
        <FormularioAcao
          acao={acaoDistribuirAgora}
          aoConcluir={
            <Aviso tom="positivo">
              Distribuídas. Confira no quadro de ordens.
            </Aviso>
          }
        >
          <BotaoEnviar variante="primario">
            Distribuir as OS abertas agora
          </BotaoEnviar>
        </FormularioAcao>
      </div>
    </div>
  );
}
