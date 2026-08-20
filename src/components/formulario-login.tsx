"use client";

import { useActionState, useEffect } from "react";
import { LogIn } from "lucide-react";
import {
  acaoEntrar,
  acaoTrocarSenha,
  type ResultadoComDestino,
} from "@/app/acoes/conta";
import { Aviso, Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

export function FormularioLogin({ destino }: { destino?: string }) {
  const [estado, enviar] = useActionState<ResultadoComDestino, FormData>(
    acaoEntrar,
    {},
  );

  // ver o comentário em acoes/conta.ts: a casca do sistema só monta certo
  // num documento novo
  useEffect(() => {
    if (estado.ok && estado.destino) window.location.assign(estado.destino);
  }, [estado.ok, estado.destino]);

  return (
    <form action={enviar} className="space-y-3">
      {estado.erro && (
        <Aviso tom="critico" titulo="Não foi possível entrar">
          {estado.erro}
        </Aviso>
      )}
      {destino && <input type="hidden" name="destino" value={destino} />}

      <Campo rotulo="E-mail" obrigatorio>
        <input
          name="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          placeholder="voce@empresa.com.br"
        />
      </Campo>

      <Campo rotulo="Senha" obrigatorio>
        <input
          name="senha"
          type="password"
          autoComplete="current-password"
          required
        />
      </Campo>

      <BotaoEnviar className="w-full">
        <LogIn className="size-4" aria-hidden /> Entrar
      </BotaoEnviar>
    </form>
  );
}

/**
 * 3.66 — troca de senha.
 *
 * `primeiroAcesso` muda só o texto: quem foi obrigado a trocar não tem uma
 * "senha atual" que ele mesmo escolheu, e pedir isso confunde.
 */
export function FormularioSenha({
  primeiroAcesso,
}: {
  primeiroAcesso?: boolean;
}) {
  const [estado, enviar] = useActionState<ResultadoComDestino, FormData>(
    acaoTrocarSenha,
    {},
  );

  /*
   * Carregamento completo, não navegação de cliente: a tela de senha vive
   * fora da casca do sistema, e só um documento novo faz o layout raiz voltar
   * a montar a casca do destino.
   */
  useEffect(() => {
    if (estado.ok && estado.destino) window.location.assign(estado.destino);
  }, [estado.ok, estado.destino]);

  return (
    <form action={enviar} className="space-y-3">
      {estado.erro && (
        <Aviso tom="critico" titulo="Não foi possível trocar a senha">
          {estado.erro}
        </Aviso>
      )}
      {estado.ok && (
        <Aviso tom="positivo">Senha alterada. Abrindo o sistema…</Aviso>
      )}
      {primeiroAcesso && (
        <Aviso tom="atencao" titulo="Defina uma senha sua">
          A senha atual foi criada por um administrador. Enquanto ela não for
          trocada, o acesso fica limitado a esta tela.
        </Aviso>
      )}

      <Campo
        rotulo={primeiroAcesso ? "Senha recebida" : "Senha atual"}
        obrigatorio
      >
        <input
          name="senhaAtual"
          type="password"
          autoComplete="current-password"
          required
        />
      </Campo>

      <Campo rotulo="Nova senha" obrigatorio dica="Ao menos 8 caracteres.">
        <input
          name="senhaNova"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>

      <Campo rotulo="Confirme a nova senha" obrigatorio>
        <input
          name="confirmacao"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Campo>

      <p className="text-xs text-[var(--texto-3)]">
        Trocar a senha encerra as outras sessões abertas com este usuário.
      </p>

      <BotaoEnviar className="w-full">Salvar nova senha</BotaoEnviar>
    </form>
  );
}
