"use client";

import { useActionState, useEffect, useState } from "react";

import { PAPEL_USUARIO, TIPO_ESTOQUE, TIPOS_ESTOQUE_SISTEMA } from "@/lib/dominio";
import {
  acaoCriarCategoria,
  acaoCriarEquipe,
  acaoCriarEstoque,
  acaoCriarFornecedor,
  acaoCriarTecnico,
  acaoSalvarLimiares,
} from "@/app/acoes/estoque";
import type { Limiares } from "@/lib/servicos/consultas";
import { Aviso, Botao, Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";
import type { ResultadoTecnico } from "@/app/acoes/estoque";

/** 1.16 — as faixas de criticidade são configuráveis. */
export function FormularioLimiares({ atuais }: { atuais: Limiares }) {
  return (
    <FormularioAcao
      acao={acaoSalvarLimiares}
      className="space-y-3"
      aoConcluir={<Aviso tom="positivo">Regras atualizadas.</Aviso>}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Normal acima de (%)" dica="do estoque ideal">
          <input
            type="number"
            name="normal"
            min={0}
            max={100}
            defaultValue={atuais.normal}
          />
        </Campo>
        <Campo rotulo="Atenção a partir de (%)">
          <input
            type="number"
            name="atencao"
            min={0}
            max={100}
            defaultValue={atuais.atencao}
          />
        </Campo>
        <Campo rotulo="Crítico a partir de (%)">
          <input
            type="number"
            name="critico"
            min={0}
            max={100}
            defaultValue={atuais.critico}
          />
        </Campo>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Material parado (dias)" dica="alerta de estoque sem giro">
          <input
            type="number"
            name="diasMaterialParado"
            min={1}
            defaultValue={atuais.diasMaterialParado}
          />
        </Campo>
        <Campo rotulo="Desvio de consumo (%)" dica="dispara alerta de anomalia">
          <input
            type="number"
            name="desvioConsumo"
            min={1}
            defaultValue={atuais.desvioConsumo}
          />
        </Campo>
        <Campo rotulo="Aguardando devolução (dias)">
          <input
            type="number"
            name="diasAguardandoDevolucao"
            min={1}
            defaultValue={atuais.diasAguardandoDevolucao}
          />
        </Campo>
      </div>

      <BotaoEnviar>Salvar regras</BotaoEnviar>
    </FormularioAcao>
  );
}

export function FormularioCategoria() {
  return (
    <FormularioAcao acao={acaoCriarCategoria} className="flex flex-wrap items-end gap-2">
      <Campo rotulo="Nova categoria" className="min-w-48 flex-1">
        <input name="nome" required placeholder="Ex.: Ferramenta de fusão" />
      </Campo>
      <Campo rotulo="Cor" className="w-20">
        <input type="color" name="cor" defaultValue="#64748b" className="h-9 p-1" />
      </Campo>
      <BotaoEnviar variante="secundario">Adicionar</BotaoEnviar>
    </FormularioAcao>
  );
}

export function FormularioEstoque({
  usuarios,
}: {
  usuarios: { id: string; nome: string; papel: string }[];
}) {
  return (
    <FormularioAcao acao={acaoCriarEstoque} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio>
          <input name="nome" required placeholder="Estoque Central" />
        </Campo>
        <Campo rotulo="Tipo" obrigatorio>
          <select name="tipo" defaultValue="CENTRAL">
            {TIPO_ESTOQUE.opcoes
              .filter((o) => !TIPOS_ESTOQUE_SISTEMA.includes(o.valor))
              .map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
          </select>
        </Campo>
        <Campo rotulo="Endereço" className="sm:col-span-2">
          <input name="endereco" />
        </Campo>
        <Campo rotulo="Latitude" dica="Preparado para o mapa do Bloco 3">
          <input name="latitude" type="number" step="any" />
        </Campo>
        <Campo rotulo="Longitude">
          <input name="longitude" type="number" step="any" />
        </Campo>
        <Campo rotulo="Responsável" className="sm:col-span-2">
          <select name="responsavelId" defaultValue="">
            <option value="">Não informado</option>
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nome} — {PAPEL_USUARIO.rotulo(usuario.papel)}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <BotaoEnviar variante="secundario">Criar local</BotaoEnviar>
    </FormularioAcao>
  );
}

/**
 * 2.4 — cadastrar o técnico e recolher as OS que já eram dele.
 *
 * A OS chega do SGP antes de o técnico existir aqui, trazendo o responsável
 * como texto. Se o nome bater, o vínculo é automático. Se for parecido —
 * "Lucas Souza" contra "Lucas de Souza" — a tela pergunta, porque reatribuir
 * o trabalho de alguém por semelhança de nome é decisão de gente.
 *
 * Os campos são controlados porque a pergunta passa pelo servidor: sem isso, o
 * que a pessoa digitou sumiria ao voltar com a confirmação.
 */
export function FormularioTecnico({
  equipes,
}: {
  equipes: { id: string; nome: string }[];
}) {
  const [estado, enviar] = useActionState<ResultadoTecnico, FormData>(
    acaoCriarTecnico,
    {},
  );

  const [nome, setNome] = useState("");
  const [matricula, setMatricula] = useState("");
  const [telefone, setTelefone] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [confirmado, setConfirmado] = useState("");

  useEffect(() => {
    if (estado.ok) {
      setNome("");
      setMatricula("");
      setTelefone("");
      setEquipeId("");
      setConfirmado("");
    }
  }, [estado.ok]);

  return (
    <form action={enviar} className="space-y-3">
      {estado.erro && (
        <Aviso tom="critico" titulo="Não foi possível concluir">
          {estado.erro}
        </Aviso>
      )}

      {estado.ok && (
        <Aviso tom="positivo">
          Técnico cadastrado
          {estado.vinculadas
            ? ` — ${estado.vinculadas} OS do SGP passaram a ser dele.`
            : "."}
        </Aviso>
      )}

      {estado.confirmar && (
        <Aviso tom="atencao" titulo="É a mesma pessoa?">
          O SGP tem <strong>{estado.confirmar.abertas}</strong> OS aberta(s) sob
          o nome <strong>{estado.confirmar.nome}</strong> (
          {estado.confirmar.total} no total). O técnico que você está
          cadastrando é essa pessoa?
          <span className="mt-2 flex flex-wrap gap-2">
            <Botao
              type="submit"
              variante="primario"
              onClick={() => setConfirmado(estado.confirmar!.nome)}
            >
              Sim, é a mesma pessoa
            </Botao>
            <Botao
              type="submit"
              variante="sutil"
              onClick={() => setConfirmado("-")}
            >
              Não, é outra pessoa
            </Botao>
          </span>
        </Aviso>
      )}

      <input type="hidden" name="vincularNome" value={confirmado} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" obrigatorio>
          <input
            name="nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Matrícula" obrigatorio>
          <input
            name="matricula"
            required
            placeholder="T-006"
            value={matricula}
            onChange={(e) => setMatricula(e.target.value)}
          />
        </Campo>
        <Campo rotulo="Telefone">
          <input
            name="telefone"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
          />
        </Campo>
        <Campo
          rotulo="Equipe"
          dica={
            equipes.length === 0
              ? "Nenhuma equipe cadastrada ainda — crie acima se quiser agrupar."
              : undefined
          }
        >
          <select
            name="equipeId"
            value={equipeId}
            onChange={(e) => setEquipeId(e.target.value)}
          >
            <option value="">Sem equipe</option>
            {equipes.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      {!estado.confirmar && (
        <BotaoEnviar variante="secundario">Criar técnico</BotaoEnviar>
      )}
    </form>
  );
}

export function FormularioEquipe() {
  return (
    <FormularioAcao acao={acaoCriarEquipe} className="flex flex-wrap items-end gap-2">
      <Campo rotulo="Nome da equipe" className="min-w-40 flex-1">
        <input name="nome" required placeholder="Manutenção 02" />
      </Campo>
      <Campo rotulo="Tipo" className="min-w-40">
        <select name="tipo" defaultValue="INSTALACAO">
          <option value="INSTALACAO">Instalação</option>
          <option value="MANUTENCAO">Manutenção</option>
          <option value="INFRAESTRUTURA">Infraestrutura</option>
          <option value="OUTRA">Outra</option>
        </select>
      </Campo>
      <BotaoEnviar variante="secundario">Criar</BotaoEnviar>
    </FormularioAcao>
  );
}

export function FormularioFornecedor() {
  return (
    <FormularioAcao acao={acaoCriarFornecedor} className="flex flex-wrap items-end gap-2">
      <Campo rotulo="Fornecedor" className="min-w-40 flex-1">
        <input name="nome" required />
      </Campo>
      <Campo rotulo="CNPJ" className="min-w-40">
        <input name="documento" />
      </Campo>
      <Campo rotulo="Contato" className="min-w-32">
        <input name="contato" />
      </Campo>
      <BotaoEnviar variante="secundario">Adicionar</BotaoEnviar>
    </FormularioAcao>
  );
}
