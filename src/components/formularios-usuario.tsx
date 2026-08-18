"use client";

import { useState } from "react";
import { KeyRound, Pencil, Plus } from "lucide-react";
import { PAPEL_USUARIO } from "@/lib/dominio";
import { acaoDefinirSenhaDe, acaoSalvarUsuario } from "@/app/acoes/conta";
import { Aviso, Botao, Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

type UsuarioEditavel = {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ativo: boolean;
};

function CamposUsuario({ usuario }: { usuario?: UsuarioEditavel }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Campo rotulo="Nome" obrigatorio>
        <input name="nome" defaultValue={usuario?.nome} required />
      </Campo>
      <Campo rotulo="E-mail" obrigatorio>
        <input
          name="email"
          type="email"
          defaultValue={usuario?.email}
          required
        />
      </Campo>
      <Campo rotulo="Perfil" obrigatorio>
        <select name="papel" defaultValue={usuario?.papel ?? "VISUALIZACAO"}>
          {PAPEL_USUARIO.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      {usuario ? (
        <Campo rotulo="Situação">
          <select name="ativo" defaultValue={usuario.ativo ? "true" : "false"}>
            <option value="true">Ativo</option>
            <option value="false">Inativo — encerra as sessões</option>
          </select>
        </Campo>
      ) : (
        <Campo
          rotulo="Senha inicial"
          obrigatorio
          dica="A pessoa será obrigada a trocar no primeiro acesso."
        >
          <input name="senha" type="password" minLength={8} required />
        </Campo>
      )}
    </div>
  );
}

export function NovoUsuario() {
  return (
    <FormularioAcao
      acao={acaoSalvarUsuario}
      className="space-y-3"
      aoConcluir={<Aviso tom="positivo">Usuário criado.</Aviso>}
    >
      <CamposUsuario />
      <BotaoEnviar>
        <Plus className="size-4" aria-hidden /> Criar usuário
      </BotaoEnviar>
    </FormularioAcao>
  );
}

/**
 * Edição e redefinição de senha na própria linha da tabela — abrir uma tela
 * inteira para trocar um perfil é atrito sem contrapartida.
 */
export function LinhaUsuario({ usuario }: { usuario: UsuarioEditavel }) {
  const [painel, setPainel] = useState<"fechado" | "editar" | "senha">(
    "fechado",
  );

  if (painel === "fechado") {
    return (
      <div className="flex gap-1">
        <Botao
          variante="sutil"
          onClick={() => setPainel("editar")}
          aria-label={`Editar ${usuario.nome}`}
        >
          <Pencil className="size-3.5" aria-hidden />
        </Botao>
        <Botao
          variante="sutil"
          onClick={() => setPainel("senha")}
          aria-label={`Definir senha de ${usuario.nome}`}
        >
          <KeyRound className="size-3.5" aria-hidden />
        </Botao>
      </div>
    );
  }

  return (
    <div className="w-full min-w-72 rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3">
      {painel === "editar" ? (
        <FormularioAcao acao={acaoSalvarUsuario} className="space-y-3">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <CamposUsuario usuario={usuario} />
          <div className="flex gap-2">
            <BotaoEnviar>Salvar</BotaoEnviar>
            <Botao variante="sutil" onClick={() => setPainel("fechado")}>
              Cancelar
            </Botao>
          </div>
        </FormularioAcao>
      ) : (
        <FormularioAcao acao={acaoDefinirSenhaDe} className="space-y-3">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <Campo
            rotulo={`Nova senha de ${usuario.nome}`}
            obrigatorio
            dica="Troca obrigatória no próximo acesso — você não deve continuar sabendo a senha dele."
          >
            <input name="senha" type="password" minLength={8} required />
          </Campo>
          <div className="flex gap-2">
            <BotaoEnviar>Definir senha</BotaoEnviar>
            <Botao variante="sutil" onClick={() => setPainel("fechado")}>
              Cancelar
            </Botao>
          </div>
        </FormularioAcao>
      )}
    </div>
  );
}
