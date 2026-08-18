"use client";

import Link from "next/link";
import {
  PRIORIDADE_OS,
  SEVERIDADE_OS,
  STATUS_OS,
  TIPO_OS,
} from "@/lib/dominio";
import {
  acaoAtribuirOrdem,
  acaoAtualizarOrdem,
  acaoCriarOrdem,
  acaoMoverOrdem,
} from "@/app/acoes/operacao";
import { Aviso, Campo, Cartao } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

export type OrdemEditavel = {
  id: string;
  numero: string;
  tipo: string;
  titulo: string | null;
  descricao: string | null;
  cliente: string | null;
  contrato: string | null;
  endereco: string | null;
  bairroId: string | null;
  cidade: string | null;
  latitude: number | null;
  longitude: number | null;
  prioridade: string;
  severidade: string;
  sla: number | null;
  status: string;
  tecnicoId: string | null;
};

/**
 * 2.1 — cadastro de OS na Central.
 *
 * O SGP continua sendo a origem oficial. Este formulário existe para o que
 * chega por fora: o chamado que entrou pelo WhatsApp, a visita agendada no
 * balcão, a manutenção preventiva que ninguém abriu no sistema.
 */
export function FormularioOS({
  bairros,
  tecnicos,
  ordem,
}: {
  bairros: { id: string; nome: string; cidade: string }[];
  tecnicos: { id: string; nome: string }[];
  ordem?: OrdemEditavel;
}) {
  const edicao = Boolean(ordem);

  return (
    <FormularioAcao
      acao={edicao ? acaoAtualizarOrdem : acaoCriarOrdem}
      className="space-y-4"
      aoConcluir={
        <Aviso tom="positivo" titulo="Salvo">
          {edicao ? (
            "Alterações registradas."
          ) : (
            <>
              OS registrada.{" "}
              <Link href="/os" className="font-medium underline">
                Ver a lista
              </Link>
              .
            </>
          )}
        </Aviso>
      }
    >
      {ordem && <input type="hidden" name="ordemId" value={ordem.id} />}

      <Cartao titulo="Atendimento">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo
            rotulo="Número da OS"
            obrigatorio
            dica={edicao ? "O número não muda depois de criado." : "O mesmo número usado no SGP."}
          >
            <input
              name="numero"
              defaultValue={ordem?.numero}
              placeholder="OS-2026-0148"
              required
              disabled={edicao}
            />
          </Campo>

          <Campo rotulo="Tipo" obrigatorio>
            <select name="tipo" defaultValue={ordem?.tipo ?? "INSTALACAO"} required>
              {TIPO_OS.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Cliente">
            <input name="cliente" defaultValue={ordem?.cliente ?? ""} />
          </Campo>

          <Campo rotulo="Contrato">
            <input name="contrato" defaultValue={ordem?.contrato ?? ""} />
          </Campo>

          <Campo rotulo="Título" className="sm:col-span-2">
            <input
              name="titulo"
              defaultValue={ordem?.titulo ?? ""}
              placeholder="Sem sinal após queda de energia"
            />
          </Campo>

          <Campo rotulo="Descrição" className="sm:col-span-2">
            <textarea name="descricao" rows={3} defaultValue={ordem?.descricao ?? ""} />
          </Campo>
        </div>
      </Cartao>

      <Cartao
        titulo="Onde"
        descricao="Sem coordenada a OS não entra na roteirização nem na fila inteligente."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Endereço" className="sm:col-span-2">
            <input
              name="endereco"
              defaultValue={ordem?.endereco ?? ""}
              placeholder="Rua das Acácias, 240"
            />
          </Campo>

          <Campo rotulo="Bairro">
            <select name="bairroId" defaultValue={ordem?.bairroId ?? ""}>
              <option value="">Não informado</option>
              {bairros.map((bairro) => (
                <option key={bairro.id} value={bairro.id}>
                  {bairro.nome} — {bairro.cidade}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Cidade">
            <input name="cidade" defaultValue={ordem?.cidade ?? ""} />
          </Campo>

          <Campo rotulo="Latitude" dica="Ex.: -3.7896">
            <input
              name="latitude"
              inputMode="decimal"
              defaultValue={ordem?.latitude ?? ""}
            />
          </Campo>

          <Campo rotulo="Longitude" dica="Ex.: -38.4921">
            <input
              name="longitude"
              inputMode="decimal"
              defaultValue={ordem?.longitude ?? ""}
            />
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Prioridade e prazo">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Prioridade">
            <select name="prioridade" defaultValue={ordem?.prioridade ?? "P3"}>
              {PRIORIDADE_OS.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo rotulo="Severidade">
            <select name="severidade" defaultValue={ordem?.severidade ?? "MEDIA"}>
              {SEVERIDADE_OS.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>

          <Campo
            rotulo="SLA em minutos"
            dica="O prazo é calculado somando este tempo à abertura."
          >
            <input
              name="sla"
              type="number"
              min={0}
              step={30}
              defaultValue={ordem?.sla ?? ""}
              placeholder="240"
            />
          </Campo>

          <Campo rotulo="Agendada para">
            <input name="agendadaPara" type="datetime-local" />
          </Campo>

          {!edicao && (
            <Campo rotulo="Responsável" className="sm:col-span-2">
              <select name="tecnicoId" defaultValue="">
                <option value="">Deixar na fila, sem responsável</option>
                {tecnicos.map((tecnico) => (
                  <option key={tecnico.id} value={tecnico.id}>
                    {tecnico.nome}
                  </option>
                ))}
              </select>
            </Campo>
          )}
        </div>
      </Cartao>

      <div className="flex justify-end gap-2">
        <BotaoEnviar>{edicao ? "Salvar alterações" : "Registrar OS"}</BotaoEnviar>
      </div>
    </FormularioAcao>
  );
}

/** 2.22 — troca de responsável na tela da OS. */
export function FormularioResponsavel({
  ordemId,
  tecnicoId,
  tecnicos,
}: {
  ordemId: string;
  tecnicoId: string | null;
  tecnicos: { id: string; nome: string; equipe: string | null }[];
}) {
  return (
    <FormularioAcao acao={acaoAtribuirOrdem} className="space-y-3">
      <input type="hidden" name="ordemId" value={ordemId} />
      <Campo rotulo="Responsável">
        <select name="tecnicoId" defaultValue={tecnicoId ?? ""}>
          <option value="">Sem responsável</option>
          {tecnicos.map((tecnico) => (
            <option key={tecnico.id} value={tecnico.id}>
              {tecnico.nome}
              {tecnico.equipe ? ` — ${tecnico.equipe}` : ""}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Observação">
        <input name="observacao" placeholder="Motivo da troca" />
      </Campo>
      <BotaoEnviar>Atribuir</BotaoEnviar>
    </FormularioAcao>
  );
}

/** 2.20 — mover a OS pelo fluxo, a partir da tela de detalhe. */
export function FormularioSituacao({
  ordemId,
  status,
}: {
  ordemId: string;
  status: string;
}) {
  return (
    <FormularioAcao acao={acaoMoverOrdem} className="space-y-3">
      <input type="hidden" name="ordemId" value={ordemId} />
      <Campo rotulo="Situação">
        <select name="status" defaultValue={status}>
          {STATUS_OS.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="Motivo" dica="Fica registrado na auditoria.">
        <input name="motivo" placeholder="Cliente ausente" />
      </Campo>
      <BotaoEnviar>Atualizar situação</BotaoEnviar>
    </FormularioAcao>
  );
}
