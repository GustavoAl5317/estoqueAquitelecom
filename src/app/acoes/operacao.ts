"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import {
  atribuirOrdem,
  atualizarOrdem,
  criarOrdem,
  moverOrdem,
} from "@/lib/servicos/ordens";
import {
  criarRegiao,
  lerPoligono,
  salvarBairro,
  salvarPoligono,
} from "@/lib/servicos/regioes";
import { atualizarTipoOS, criarTipoOS } from "@/lib/servicos/tipos-os";
import { podeFazer } from "@/lib/permissoes";
import { prisma } from "@/lib/prisma";
import type { Resultado } from "./estoque";

/**
 * 3.67 — o técnico mexe só nas OS dele.
 *
 * A permissão `os.executar` deixa mover o cartão pelo fluxo de campo; ela não
 * deixa mexer no atendimento de outra pessoa. Quem tem `os.gerenciar` (supervisão)
 * passa direto.
 */
async function garantirDominioSobreOrdem(
  usuario: { id: string; papel: string; tecnicoId: string | null },
  ordemId: string,
) {
  if (podeFazer(usuario.papel, "os.gerenciar")) return;

  const ordem = await prisma.ordemServico.findUnique({
    where: { id: ordemId },
    select: { tecnicoId: true, numero: true },
  });
  if (!ordem) throw new ErroDeNegocio("Ordem de serviço não encontrada.");

  if (!usuario.tecnicoId || ordem.tecnicoId !== usuario.tecnicoId) {
    throw new ErroDeNegocio(
      `A OS ${ordem.numero} está com outro técnico. Fale com a supervisão para assumir.`,
    );
  }
}

/**
 * Server actions dos Blocos 2, 3 e 4.
 *
 * Mesmo contrato das ações de estoque: erro de regra de negócio volta como
 * mensagem para o formulário, erro inesperado vai para o log do servidor.
 */
async function executar<T>(
  operacao: () => Promise<T>,
  caminhos: string[],
): Promise<Resultado> {
  try {
    await operacao();
    for (const caminho of caminhos) revalidatePath(caminho);
    return { ok: true };
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    console.error(erro);
    return {
      erro:
        erro instanceof Error
          ? erro.message
          : "Não foi possível concluir a operação.",
    };
  }
}

const texto = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? v.trim() : null;

const numero = (v: FormDataEntryValue | null) => {
  if (typeof v !== "string" || !v.trim()) return null;
  const convertido = Number(v.replace(",", "."));
  return Number.isFinite(convertido) ? convertido : null;
};

const data = (v: FormDataEntryValue | null) => {
  const bruto = texto(v);
  if (!bruto) return null;
  const convertida = new Date(bruto);
  return Number.isNaN(convertida.getTime()) ? null : convertida;
};

/** as telas que mostram OS — revalidadas juntas para não exibir dado velho */
const TELAS_OS = ["/os", "/os/quadro", "/fila", "/roteiro", "/central", "/ordens", "/campo"];

export async function acaoCriarOrdem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      criarOrdem(
        {
          numero: String(dados.get("numero") ?? ""),
          tipo: String(dados.get("tipo") ?? "NAO_INFORMADO"),
          titulo: texto(dados.get("titulo")),
          descricao: texto(dados.get("descricao")),
          cliente: texto(dados.get("cliente")),
          contrato: texto(dados.get("contrato")),
          endereco: texto(dados.get("endereco")),
          bairroId: texto(dados.get("bairroId")),
          cidade: texto(dados.get("cidade")),
          latitude: numero(dados.get("latitude")),
          longitude: numero(dados.get("longitude")),
          prioridade: String(dados.get("prioridade") ?? "P3"),
          severidade: String(dados.get("severidade") ?? "MEDIA"),
          sla: numero(dados.get("sla")),
          agendadaPara: data(dados.get("agendadaPara")),
          tecnicoId: texto(dados.get("tecnicoId")),
        },
        usuario.id,
      ),
    TELAS_OS,
  );
}

export async function acaoAtualizarOrdem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const id = String(dados.get("ordemId") ?? "");
  return executar(
    () =>
      atualizarOrdem(
        id,
        {
          tipo: String(dados.get("tipo") ?? "NAO_INFORMADO"),
          titulo: texto(dados.get("titulo")),
          descricao: texto(dados.get("descricao")),
          cliente: texto(dados.get("cliente")),
          contrato: texto(dados.get("contrato")),
          endereco: texto(dados.get("endereco")),
          bairroId: texto(dados.get("bairroId")),
          cidade: texto(dados.get("cidade")),
          latitude: numero(dados.get("latitude")),
          longitude: numero(dados.get("longitude")),
          prioridade: String(dados.get("prioridade") ?? "P3"),
          severidade: String(dados.get("severidade") ?? "MEDIA"),
          sla: numero(dados.get("sla")),
          agendadaPara: data(dados.get("agendadaPara")),
        },
        usuario.id,
      ),
    [...TELAS_OS, `/os/${id}`],
  );
}

/** 2.22 — usada tanto na tela da OS quanto no botão de recomendação da fila. */
export async function acaoAtribuirOrdem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "os.gerenciar")) {
    return { erro: "Seu perfil não permite trocar o responsável de uma OS." };
  }
  const ordemId = String(dados.get("ordemId") ?? "");
  return executar(
    () =>
      atribuirOrdem(
        {
          ordemId,
          tecnicoId: texto(dados.get("tecnicoId")),
          observacao: texto(dados.get("observacao")),
        },
        usuario.id,
      ),
    [...TELAS_OS, `/os/${ordemId}`],
  );
}

/** 2.20 / 3.63 — mover o cartão de coluna, no quadro ou na tela do técnico. */
export async function acaoMoverOrdem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const ordemId = String(dados.get("ordemId") ?? "");
  return executar(async () => {
    await garantirDominioSobreOrdem(usuario, ordemId);
    return moverOrdem(
      {
        ordemId,
        status: String(dados.get("status") ?? ""),
        motivo: texto(dados.get("motivo")),
      },
      usuario.id,
    );
  }, [...TELAS_OS, `/os/${ordemId}`]);
}

export async function acaoCriarRegiao(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () => criarRegiao(String(dados.get("nome") ?? ""), usuario.id),
    ["/regioes"],
  );
}

/** 3.17 — o contorno do bairro, desenhado no mapa da tela de regiões. */
export async function acaoSalvarPoligono(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "operacao.supervisionar")) {
    return { erro: "Seu perfil não permite alterar o contorno de um bairro." };
  }

  return executar(
    () =>
      salvarPoligono(
        {
          bairroId: String(dados.get("bairroId") ?? ""),
          vertices: lerPoligono(String(dados.get("vertices") ?? "")),
        },
        usuario.id,
      ),
    ["/regioes", "/os/mapa"],
  );
}

export async function acaoSalvarBairro(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      salvarBairro(
        {
          id: texto(dados.get("bairroId")),
          nome: String(dados.get("nome") ?? ""),
          cidade: String(dados.get("cidade") ?? ""),
          regiaoId: texto(dados.get("regiaoId")),
          responsavelPrincipalId: texto(dados.get("responsavelPrincipalId")),
          responsavelSecundarioId: texto(dados.get("responsavelSecundarioId")),
          equipeId: texto(dados.get("equipeId")),
        },
        usuario.id,
      ),
    ["/regioes", "/fila", "/os"],
  );
}

/**
 * 2.5 — os tipos de OS, cadastrados em vez de fixos no código.
 *
 * Exige `sistema.administrar`: mexer no vocabulário do Bloco 2 muda o que
 * aparece em relatório, fila e mapa — não é ajuste de rotina de supervisão.
 */
export async function acaoCriarTipoOS(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite criar tipos de OS." };
  }

  return executar(
    () =>
      criarTipoOS(
        {
          rotulo: String(dados.get("rotulo") ?? ""),
          tom: String(dados.get("tom") ?? "neutro"),
        },
        usuario.id,
      ),
    ["/configuracoes", "/os", "/os/nova"],
  );
}

export async function acaoAtualizarTipoOS(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite alterar tipos de OS." };
  }

  return executar(
    () =>
      atualizarTipoOS(
        {
          id: String(dados.get("tipoId") ?? ""),
          rotulo: String(dados.get("rotulo") ?? ""),
          tom: String(dados.get("tom") ?? "neutro"),
          ativo: dados.get("ativo") === "1",
        },
        usuario.id,
      ),
    ["/configuracoes", "/os", "/os/nova"],
  );
}
