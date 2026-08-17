import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar, type Tx } from "./nucleo";

/**
 * FROTA E LOCALIZAÇÃO (Bloco 3 — camada 1).
 *
 * A posição vem do rastreador do veículo. O rastreador sabe onde está o carro;
 * quem está dirigindo é informação que só existe aqui, mantida na Central de
 * Controle. Sem esse vínculo, a coordenada não vira decisão operacional.
 */

export async function criarVeiculo(
  dados: {
    placa: string;
    apelido?: string | null;
    modelo?: string | null;
    rastreador?: string | null;
    estoqueId?: string | null;
  },
  usuarioId: string,
) {
  const placa = dados.placa.trim().toUpperCase();
  if (!placa) throw new ErroDeNegocio("Informe a placa do veículo.");

  const existente = await prisma.veiculo.findUnique({ where: { placa } });
  if (existente) throw new ErroDeNegocio(`O veículo ${placa} já está cadastrado.`);

  const veiculo = await prisma.veiculo.create({
    data: {
      placa,
      apelido: dados.apelido?.trim() || null,
      modelo: dados.modelo?.trim() || null,
      rastreador: dados.rastreador?.trim() || null,
      estoqueId: dados.estoqueId || null,
    },
  });

  await auditar(prisma, {
    entidade: "Veiculo",
    entidadeId: veiculo.id,
    acao: "CRIACAO",
    descricao: `Veículo ${placa} cadastrado.`,
    usuarioId,
    depois: dados,
  });

  return veiculo;
}

/**
 * Troca quem está com o veículo. Fecha o vínculo anterior e abre um novo, de
 * modo que o histórico permita reconstruir quem estava onde em qualquer data.
 */
export async function vincularVeiculo(
  dados: { veiculoId: string; tecnicoId: string | null; observacao?: string | null },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const veiculo = await tx.veiculo.findUnique({
      where: { id: dados.veiculoId },
      include: { tecnicoAtual: true },
    });
    if (!veiculo) throw new ErroDeNegocio("Veículo não encontrado.");

    if (veiculo.tecnicoAtualId === dados.tecnicoId) {
      return veiculo;
    }

    // fecha o vínculo aberto, se houver
    await tx.vinculoVeiculo.updateMany({
      where: { veiculoId: veiculo.id, fim: null },
      data: { fim: new Date() },
    });

    let tecnicoNome = "ninguém";

    if (dados.tecnicoId) {
      const tecnico = await tx.tecnico.findUnique({
        where: { id: dados.tecnicoId },
      });
      if (!tecnico) throw new ErroDeNegocio("Técnico não encontrado.");
      tecnicoNome = tecnico.nome;

      // um técnico não dirige dois veículos ao mesmo tempo
      const outro = await tx.veiculo.findFirst({
        where: { tecnicoAtualId: tecnico.id, id: { not: veiculo.id } },
      });
      if (outro) {
        await tx.vinculoVeiculo.updateMany({
          where: { veiculoId: outro.id, fim: null },
          data: { fim: new Date() },
        });
        await tx.veiculo.update({
          where: { id: outro.id },
          data: { tecnicoAtualId: null },
        });
      }

      await tx.vinculoVeiculo.create({
        data: {
          veiculoId: veiculo.id,
          tecnicoId: tecnico.id,
          criadoPorId: usuarioId,
          observacao: dados.observacao ?? null,
        },
      });
    }

    const atualizado = await tx.veiculo.update({
      where: { id: veiculo.id },
      data: { tecnicoAtualId: dados.tecnicoId },
    });

    await auditar(tx, {
      entidade: "Veiculo",
      entidadeId: veiculo.id,
      acao: "EDICAO",
      descricao:
        `Veículo ${veiculo.placa}: ${veiculo.tecnicoAtual?.nome ?? "sem técnico"} → ${tecnicoNome}.`,
      usuarioId,
      antes: { tecnico: veiculo.tecnicoAtual?.nome ?? null },
      depois: { tecnico: dados.tecnicoId ? tecnicoNome : null },
    });

    return atualizado;
  });
}

/** Ingestão de posição — usada pelo conector do rastreador e pelo lançamento manual. */
export async function registrarPosicao(dados: {
  /** identifica o veículo por id, placa ou identificador do rastreador */
  veiculoId?: string;
  placa?: string;
  rastreador?: string;
  latitude: number;
  longitude: number;
  velocidade?: number | null;
  ignicao?: boolean | null;
  endereco?: string | null;
  capturadoEm?: Date;
  origem?: string;
}) {
  const veiculo = await encontrarVeiculo(prisma, dados);
  if (!veiculo) throw new ErroDeNegocio("Veículo não identificado para esta posição.");

  if (
    !Number.isFinite(dados.latitude) ||
    !Number.isFinite(dados.longitude) ||
    Math.abs(dados.latitude) > 90 ||
    Math.abs(dados.longitude) > 180
  ) {
    throw new ErroDeNegocio("Coordenada inválida.");
  }

  return prisma.posicaoVeiculo.create({
    data: {
      veiculoId: veiculo.id,
      latitude: dados.latitude,
      longitude: dados.longitude,
      velocidade: dados.velocidade ?? null,
      ignicao: dados.ignicao ?? null,
      endereco: dados.endereco ?? null,
      capturadoEm: dados.capturadoEm ?? new Date(),
      origem: dados.origem ?? "RASTREADOR",
    },
  });
}

async function encontrarVeiculo(
  tx: Tx,
  chaves: { veiculoId?: string; placa?: string; rastreador?: string },
) {
  if (chaves.veiculoId) {
    return tx.veiculo.findUnique({ where: { id: chaves.veiculoId } });
  }
  if (chaves.rastreador) {
    const achado = await tx.veiculo.findUnique({
      where: { rastreador: chaves.rastreador.trim() },
    });
    if (achado) return achado;
  }
  if (chaves.placa) {
    return tx.veiculo.findUnique({
      where: { placa: chaves.placa.trim().toUpperCase() },
    });
  }
  return null;
}

export type SituacaoFrota = {
  id: string;
  placa: string;
  apelido: string | null;
  modelo: string | null;
  rastreador: string | null;
  ativo: boolean;
  tecnicoId: string | null;
  tecnicoNome: string | null;
  equipeNome: string | null;
  estoqueNome: string | null;
  detentorId: string | null;
  latitude: number | null;
  longitude: number | null;
  velocidade: number | null;
  ignicao: boolean | null;
  endereco: string | null;
  capturadoEm: Date | null;
  /** minutos desde a última posição recebida */
  atrasoMinutos: number | null;
  /** 3.8 — a posição é atual ou já está velha? */
  frescor: "ATUAL" | "RECENTE" | "DESATUALIZADA" | "SEM_SINAL";
};

/** 3.7 / 3.8 — situação de cada veículo, com aviso de posição desatualizada. */
export async function situacaoDaFrota(): Promise<SituacaoFrota[]> {
  const veiculos = await prisma.veiculo.findMany({
    include: {
      tecnicoAtual: { include: { equipe: true, detentor: true } },
      estoque: { include: { detentor: true } },
      posicoes: { orderBy: { capturadoEm: "desc" }, take: 1 },
    },
    orderBy: [{ ativo: "desc" }, { placa: "asc" }],
  });

  return veiculos.map((veiculo) => {
    const posicao = veiculo.posicoes[0] ?? null;
    const atraso = posicao
      ? Math.floor((Date.now() - posicao.capturadoEm.getTime()) / 60_000)
      : null;

    return {
      id: veiculo.id,
      placa: veiculo.placa,
      apelido: veiculo.apelido,
      modelo: veiculo.modelo,
      rastreador: veiculo.rastreador,
      ativo: veiculo.ativo,
      tecnicoId: veiculo.tecnicoAtualId,
      tecnicoNome: veiculo.tecnicoAtual?.nome ?? null,
      equipeNome: veiculo.tecnicoAtual?.equipe?.nome ?? null,
      estoqueNome: veiculo.estoque?.nome ?? null,
      detentorId:
        veiculo.tecnicoAtual?.detentor?.id ?? veiculo.estoque?.detentor?.id ?? null,
      latitude: posicao?.latitude ?? null,
      longitude: posicao?.longitude ?? null,
      velocidade: posicao?.velocidade ?? null,
      ignicao: posicao?.ignicao ?? null,
      endereco: posicao?.endereco ?? null,
      capturadoEm: posicao?.capturadoEm ?? null,
      atrasoMinutos: atraso,
      frescor:
        atraso === null
          ? "SEM_SINAL"
          : atraso <= 5
            ? "ATUAL"
            : atraso <= 30
              ? "RECENTE"
              : "DESATUALIZADA",
    };
  });
}

export async function historicoDoVeiculo(veiculoId: string, horas = 24) {
  const desde = new Date(Date.now() - horas * 3_600_000);
  return prisma.posicaoVeiculo.findMany({
    where: { veiculoId, capturadoEm: { gte: desde } },
    orderBy: { capturadoEm: "asc" },
  });
}

export async function vinculosRecentes(limite = 30) {
  return prisma.vinculoVeiculo.findMany({
    include: {
      veiculo: true,
      tecnico: true,
      criadoPor: { select: { nome: true } },
    },
    orderBy: { inicio: "desc" },
    take: limite,
  });
}

/** distância aproximada em km entre duas coordenadas (fórmula de Haversine) */
export function distanciaKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const R = 6371;
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 3.19 / 3.47 — quem está mais perto de um ponto, considerando também o que
 * cada técnico tem em posse. É a base da recomendação do Bloco 4.
 */
export async function tecnicosProximos(
  alvo: { latitude: number; longitude: number },
  opcoes?: { materiaisNecessarios?: { materialId: string; quantidade: number }[] },
) {
  const frota = (await situacaoDaFrota()).filter(
    (v) => v.tecnicoId && v.latitude !== null && v.longitude !== null,
  );

  const resultado = [];

  for (const veiculo of frota) {
    const distancia = distanciaKm(
      { latitude: veiculo.latitude!, longitude: veiculo.longitude! },
      alvo,
    );

    let temMaterial = true;
    const faltando: string[] = [];

    if (opcoes?.materiaisNecessarios?.length && veiculo.detentorId) {
      for (const necessario of opcoes.materiaisNecessarios) {
        const saldo = await prisma.saldo.findUnique({
          where: {
            materialId_detentorId: {
              materialId: necessario.materialId,
              detentorId: veiculo.detentorId,
            },
          },
          include: { material: { select: { nome: true } } },
        });
        const livre = (saldo?.quantidade ?? 0) - (saldo?.reservado ?? 0);
        if (livre < necessario.quantidade) {
          temMaterial = false;
          faltando.push(saldo?.material.nome ?? necessario.materialId);
        }
      }
    }

    resultado.push({
      veiculoId: veiculo.id,
      placa: veiculo.placa,
      tecnicoId: veiculo.tecnicoId!,
      tecnicoNome: veiculo.tecnicoNome!,
      equipeNome: veiculo.equipeNome,
      distanciaKm: distancia,
      frescor: veiculo.frescor,
      atrasoMinutos: veiculo.atrasoMinutos,
      temMaterial,
      faltando,
    });
  }

  return resultado.sort((a, b) => a.distanciaKm - b.distanciaKm);
}
