"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { podeFazer } from "@/lib/permissoes";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import {
  alternarJornada,
  registrarLocalizacaoTecnico,
} from "@/lib/servicos/localizacao";
import type { Resultado } from "./estoque";

/**
 * Estar ligado a um técnico não é o mesmo que trabalhar em campo.
 *
 * O vínculo usuário↔técnico é um cadastro e sobrevive à mudança de papel: quem
 * saiu da rua para a supervisão continua apontando para o mesmo técnico. Quem
 * decide se a jornada e a posição desta pessoa ainda são assunto do sistema é a
 * capacidade, e ela é conferida aqui — a tela `/campo` já exige o mesmo.
 */
async function tecnicoDeCampo() {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "os.executar")) {
    return { erro: "Seu perfil não executa ordens de serviço em campo." as const };
  }
  if (!usuario.tecnicoId) {
    return { erro: "Seu usuário não está ligado a um técnico." as const };
  }
  return { usuario, tecnicoId: usuario.tecnicoId };
}

/** 3.4 — a posição vinda do navegador do próprio técnico. */
export async function acaoRegistrarLocalizacao(
  latitude: number,
  longitude: number,
  precisao?: number | null,
): Promise<Resultado> {
  const sessao = await tecnicoDeCampo();
  if ("erro" in sessao) return sessao;

  try {
    // a mesma leitura que posiciona o técnico é a que detecta a chegada (3.35)
    await registrarLocalizacaoTecnico({
      tecnicoId: sessao.tecnicoId,
      latitude,
      longitude,
      precisao,
      usuarioId: sessao.usuario.id,
    });
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível registrar a posição." };
  }

  revalidatePath("/campo");
  revalidatePath("/central");
  return { ok: true };
}

/** 3.5 — abre e fecha a jornada; fora dela o sistema não grava posição. */
export async function acaoAlternarJornada(emJornada: boolean): Promise<Resultado> {
  const sessao = await tecnicoDeCampo();
  if ("erro" in sessao) return sessao;

  try {
    await alternarJornada(sessao.tecnicoId, emJornada, sessao.usuario.id);
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível alterar a jornada." };
  }

  revalidatePath("/campo");
  revalidatePath("/central");
  return { ok: true };
}
