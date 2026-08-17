"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import {
  criarVeiculo,
  registrarPosicao,
  vincularVeiculo,
} from "@/lib/servicos/frota";
import { salvarParametros } from "@/lib/servicos/parametros";
import type { Resultado } from "./estoque";

async function executar<T>(operacao: () => Promise<T>, caminhos: string[]) {
  try {
    const dados = await operacao();
    for (const caminho of caminhos) revalidatePath(caminho);
    return { ok: true, dados };
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return {
      erro:
        erro instanceof Error ? erro.message : "Não foi possível concluir a operação.",
    };
  }
}

const texto = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export async function acaoCriarVeiculo(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      criarVeiculo(
        {
          placa: String(dados.get("placa") ?? ""),
          apelido: texto(dados.get("apelido")),
          modelo: texto(dados.get("modelo")),
          rastreador: texto(dados.get("rastreador")),
          estoqueId: texto(dados.get("estoqueId")),
        },
        usuario.id,
      ),
    ["/central", "/locais"],
  );
}

/** Troca de motorista — a operação mais frequente da Central de Controle. */
export async function acaoVincularVeiculo(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      vincularVeiculo(
        {
          veiculoId: String(dados.get("veiculoId")),
          tecnicoId: texto(dados.get("tecnicoId")),
          observacao: texto(dados.get("observacao")),
        },
        usuario.id,
      ),
    ["/central"],
  );
}

/** Lançamento manual de posição, para quando o rastreador estiver mudo. */
export async function acaoRegistrarPosicao(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(
    () =>
      registrarPosicao({
        veiculoId: String(dados.get("veiculoId")),
        latitude: Number(String(dados.get("latitude")).replace(",", ".")),
        longitude: Number(String(dados.get("longitude")).replace(",", ".")),
        endereco: texto(dados.get("endereco")),
        origem: "MANUAL",
      }),
    ["/central"],
  );
}

export async function acaoSalvarParametros(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const numero = (chave: string) =>
    Number(String(dados.get(chave) ?? "").replace(",", "."));

  return executar(
    () =>
      salvarParametros({
        pesoDistancia: numero("pesoDistancia"),
        pesoCarga: numero("pesoCarga"),
        pesoMaterial: numero("pesoMaterial"),
        pesoRegiao: numero("pesoRegiao"),
        pesoDisponibilidade: numero("pesoDisponibilidade"),
        minutosPosicaoAtual: numero("minutosPosicaoAtual"),
        raioAtuacaoKm: numero("raioAtuacaoKm"),
        minutosParadaSuspeita: numero("minutosParadaSuspeita"),
      }),
    ["/central", "/configuracoes"],
  );
}
