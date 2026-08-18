"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import {
  alternarJornada,
  registrarLocalizacaoTecnico,
} from "@/lib/servicos/localizacao";
import type { Resultado } from "./estoque";

/** 3.4 — a posição vinda do navegador do próprio técnico. */
export async function acaoRegistrarLocalizacao(
  latitude: number,
  longitude: number,
  precisao?: number | null,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!usuario.tecnicoId) {
    return { erro: "Seu usuário não está ligado a um técnico." };
  }

  try {
    await registrarLocalizacaoTecnico({
      tecnicoId: usuario.tecnicoId,
      latitude,
      longitude,
      precisao,
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
  const usuario = await usuarioAtual();
  if (!usuario.tecnicoId) {
    return { erro: "Seu usuário não está ligado a um técnico." };
  }

  try {
    await alternarJornada(usuario.tecnicoId, emJornada, usuario.id);
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return { erro: "Não foi possível alterar a jornada." };
  }

  revalidatePath("/campo");
  revalidatePath("/central");
  return { ok: true };
}
