import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, estoqueDeSistema } from "./nucleo";
import { registrarMovimentacao } from "./movimentacoes";

/**
 * 1.12 — LOGÍSTICA REVERSA.
 *
 * O material devolvido fica parado na área de triagem até receber um laudo.
 * Concluir a triagem é sempre uma transferência rastreável: para o estoque
 * disponível, para a manutenção ou para o descarte — nunca uma exclusão.
 */
export async function concluirTriagem(
  dados: {
    triagemId: string;
    /** APROVADO | MANUTENCAO | DESCARTE */
    resultado: string;
    laudo?: string | null;
    /** obrigatório quando o resultado é APROVADO */
    destinoId?: string | null;
    estadoFisico?: string | null;
  },
  usuarioId: string,
) {
  const triagem = await prisma.triagem.findUnique({
    where: { id: dados.triagemId },
    include: { material: true, unidade: true },
  });
  if (!triagem) throw new ErroDeNegocio("Registro de triagem não encontrado.");
  if (triagem.status === "CONCLUIDA") {
    throw new ErroDeNegocio("Esta triagem já foi concluída.");
  }

  const areaTriagem = await estoqueDeSistema(prisma, "TRIAGEM");

  let destinoId = dados.destinoId ?? null;
  let tipo = "TRANSFERENCIA";
  let finalidade = "TRANSFERENCIA";

  if (dados.resultado === "APROVADO") {
    if (!destinoId) {
      throw new ErroDeNegocio(
        "Informe para qual estoque o material aprovado deve retornar.",
      );
    }
  } else if (dados.resultado === "MANUTENCAO") {
    destinoId = (await estoqueDeSistema(prisma, "MANUTENCAO")).id;
    finalidade = "MANUTENCAO";
  } else if (dados.resultado === "DESCARTE") {
    destinoId = (await estoqueDeSistema(prisma, "DESCARTE")).id;
    tipo = "BAIXA";
    finalidade = "BAIXA";
  } else {
    throw new ErroDeNegocio("Resultado de triagem inválido.");
  }

  await registrarMovimentacao(
    {
      tipo,
      finalidade,
      origemId: areaTriagem.id,
      destinoId,
      motivo: dados.laudo ?? `Triagem concluída: ${dados.resultado}`,
      observacao: `Triagem do material ${triagem.material.nome}`,
      itens: [
        {
          materialId: triagem.materialId,
          quantidade: triagem.quantidade,
          seriaisIds: triagem.unidadeId ? [triagem.unidadeId] : undefined,
          estadoFisico: dados.estadoFisico ?? triagem.estadoRecebido,
        },
      ],
    },
    usuarioId,
  );

  return prisma.triagem.update({
    where: { id: triagem.id },
    data: {
      status: "CONCLUIDA",
      resultado: dados.resultado,
      laudo: dados.laudo ?? null,
      destinoId,
      responsavelId: usuarioId,
      concluidoEm: new Date(),
    },
  });
}

export async function iniciarAnalise(triagemId: string, usuarioId: string) {
  return prisma.triagem.update({
    where: { id: triagemId },
    data: { status: "EM_ANALISE", responsavelId: usuarioId },
  });
}
