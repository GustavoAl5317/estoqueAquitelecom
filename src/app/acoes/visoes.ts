"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import { apagarVisao, salvarVisao } from "@/lib/servicos/visoes";
import type { Resultado } from "./estoque";

/**
 * 2.19 / 3.29 — VISÕES SALVAS.
 *
 * A visão é do usuário, não do sistema: qualquer perfil que enxerga a tela pode
 * guardar o próprio recorte. Compartilhar é o único ato com efeito sobre os
 * outros, e mesmo esse é reversível — quem criou apaga.
 */
async function executar(operacao: () => Promise<unknown>, tela: string) {
  try {
    await operacao();
    revalidatePath(tela);
    return { ok: true } satisfies Resultado;
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível salvar a visão." };
  }
}

export async function acaoSalvarVisao(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const tela = String(dados.get("tela") ?? "");

  return executar(
    () =>
      salvarVisao({
        nome: String(dados.get("nome") ?? ""),
        tela,
        filtros: String(dados.get("filtros") ?? ""),
        compartilhada: dados.get("compartilhada") === "1",
        usuarioId: usuario.id,
      }),
    tela,
  );
}

export async function acaoApagarVisao(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const tela = String(dados.get("tela") ?? "");

  return executar(
    () => apagarVisao(String(dados.get("visaoId") ?? ""), usuario.id),
    tela,
  );
}
