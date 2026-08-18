import { prisma } from "@/lib/prisma";
import { ErroDeNegocio, auditar, type Tx } from "./nucleo";
import { TIPO_RASTREADOR } from "@/lib/dominio";

/**
 * RASTREAMENTO (Bloco 3).
 *
 * Quem reporta posição é o **aparelho**. O que ele está rastreando é outra
 * coisa, e pode ser de três naturezas:
 *
 *   VEICULO      o carro. Quem está dirigindo só se sabe pelo vínculo mantido
 *                na Central de Controle — o rastreador não faz ideia.
 *   PESSOA       o celular do técnico. Aqui não há intermediário: a posição já
 *                é da pessoa, e é a fonte mais confiável que existe.
 *   EQUIPAMENTO  OTDR, máquina de fusão. Amarra ao patrimônio serializado e
 *                responde "onde está o equipamento" — pergunta do Bloco 1.
 *
 * Essa separação nasceu do que a operação já pratica: a conta de rastreamento
 * tem carro, celular e equipamento no mesmo lugar.
 */

// ---------------------------------------------------------------------------
// Cadastro
// ---------------------------------------------------------------------------

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
      estoqueId: dados.estoqueId || null,
    },
  });

  // quando a placa já vem com um aparelho conhecido, amarra na hora
  const identificador = dados.rastreador?.trim();
  if (identificador) {
    await vincularRastreador(
      { identificador, tipo: "VEICULO", veiculoId: veiculo.id },
      usuarioId,
    );
  }

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

/** Registra um aparelho visto na plataforma de rastreamento, sem classificá-lo. */
export async function registrarRastreador(dados: {
  identificador: string;
  nome: string;
  modelo?: string | null;
  ativo?: boolean;
}) {
  const identificador = dados.identificador.trim();
  if (!identificador) throw new ErroDeNegocio("Informe o identificador do aparelho.");

  return prisma.rastreador.upsert({
    where: { identificador },
    create: {
      identificador,
      nome: dados.nome.trim() || identificador,
      modelo: dados.modelo?.trim() || null,
      ativo: dados.ativo ?? true,
    },
    update: {
      nome: dados.nome.trim() || identificador,
      modelo: dados.modelo?.trim() || null,
      ativo: dados.ativo ?? true,
    },
  });
}

/**
 * 3.1 — Diz o que o aparelho está rastreando.
 *
 * O alvo é exclusivo: um aparelho não está em um carro e numa pessoa ao mesmo
 * tempo. Trocar o tipo limpa o alvo anterior, para não deixar vínculo órfão
 * apontando para um carro que ninguém mais associa àquele aparelho.
 */
export async function vincularRastreador(
  dados: {
    identificador?: string;
    rastreadorId?: string;
    tipo: string;
    veiculoId?: string | null;
    tecnicoId?: string | null;
    unidadeSerialId?: string | null;
  },
  usuarioId: string,
) {
  if (!TIPO_RASTREADOR.inclui(dados.tipo)) {
    throw new ErroDeNegocio("Tipo de rastreador inválido.");
  }

  const rastreador = dados.rastreadorId
    ? await prisma.rastreador.findUnique({ where: { id: dados.rastreadorId } })
    : dados.identificador
      ? await prisma.rastreador.findUnique({
          where: { identificador: dados.identificador.trim() },
        })
      : null;

  if (!rastreador) throw new ErroDeNegocio("Rastreador não encontrado.");

  const alvo = {
    veiculoId: dados.tipo === "VEICULO" ? dados.veiculoId || null : null,
    tecnicoId: dados.tipo === "PESSOA" ? dados.tecnicoId || null : null,
    unidadeSerialId:
      dados.tipo === "EQUIPAMENTO" ? dados.unidadeSerialId || null : null,
  };

  /*
   * O tipo salva sozinho, sem alvo.
   *
   * Saber que um aparelho é o celular de um técnico é um fato independente de
   * saber de qual técnico — e quase sempre se descobre antes. Exigir os dois
   * juntos travava a classificação numa base recém-criada, onde ainda não
   * existem veículos nem técnicos cadastrados: não havia o que escolher, e por
   * isso não havia como salvar.
   *
   * O vínculo continua sendo obrigatório para a posição virar decisão — quem
   * cobra isso é a tela, mostrando o aparelho como incompleto.
   */

  // o alvo é exclusivo dos dois lados: libera quem já ocupava o lugar
  for (const [campo, valor] of Object.entries(alvo)) {
    if (!valor) continue;
    await prisma.rastreador.updateMany({
      where: { [campo]: valor, id: { not: rastreador.id } },
      data: { [campo]: null, tipo: "NAO_CLASSIFICADO" },
    });
  }

  const atualizado = await prisma.rastreador.update({
    where: { id: rastreador.id },
    data: { tipo: dados.tipo, ...alvo },
    include: { veiculo: true, tecnico: true, unidadeSerial: true },
  });

  const descricaoAlvo =
    atualizado.veiculo?.placa ??
    atualizado.tecnico?.nome ??
    atualizado.unidadeSerial?.serial ??
    "ainda sem vínculo";

  await auditar(prisma, {
    entidade: "Rastreador",
    entidadeId: rastreador.id,
    acao: "EDICAO",
    descricao: `Rastreador ${rastreador.nome} classificado como ${TIPO_RASTREADOR.rotulo(dados.tipo)} → ${descricaoAlvo}.`,
    usuarioId,
    antes: { tipo: rastreador.tipo },
    depois: { tipo: dados.tipo, alvo: descricaoAlvo },
  });

  return atualizado;
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

// ---------------------------------------------------------------------------
// Ingestão de posição
// ---------------------------------------------------------------------------

/** Ingestão de posição — usada pelo conector do rastreador e pelo lançamento manual. */
export async function registrarPosicao(dados: {
  /** identifica o aparelho por id, identificador, placa do veículo ou id do veículo */
  rastreadorId?: string;
  identificador?: string;
  veiculoId?: string;
  placa?: string;
  latitude: number;
  longitude: number;
  velocidade?: number | null;
  ignicao?: boolean | null;
  endereco?: string | null;
  capturadoEm?: Date;
  origem?: string;
}) {
  const rastreador = await encontrarRastreador(prisma, dados);
  if (!rastreador) {
    throw new ErroDeNegocio("Rastreador não identificado para esta posição.");
  }

  if (
    !Number.isFinite(dados.latitude) ||
    !Number.isFinite(dados.longitude) ||
    Math.abs(dados.latitude) > 90 ||
    Math.abs(dados.longitude) > 180
  ) {
    throw new ErroDeNegocio("Coordenada inválida.");
  }

  return prisma.posicao.create({
    data: {
      rastreadorId: rastreador.id,
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

async function encontrarRastreador(
  tx: Tx,
  chaves: {
    rastreadorId?: string;
    identificador?: string;
    veiculoId?: string;
    placa?: string;
  },
) {
  if (chaves.rastreadorId) {
    return tx.rastreador.findUnique({ where: { id: chaves.rastreadorId } });
  }
  if (chaves.identificador) {
    const achado = await tx.rastreador.findUnique({
      where: { identificador: chaves.identificador.trim() },
    });
    if (achado) return achado;
  }
  if (chaves.veiculoId) {
    return tx.rastreador.findFirst({ where: { veiculoId: chaves.veiculoId } });
  }
  if (chaves.placa) {
    const veiculo = await tx.veiculo.findUnique({
      where: { placa: chaves.placa.trim().toUpperCase() },
    });
    if (veiculo) {
      return tx.rastreador.findFirst({ where: { veiculoId: veiculo.id } });
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export type Frescor = "ATUAL" | "RECENTE" | "DESATUALIZADA" | "SEM_SINAL";

export function classificarFrescor(capturadoEm: Date | null): {
  frescor: Frescor;
  atrasoMinutos: number | null;
} {
  if (!capturadoEm) return { frescor: "SEM_SINAL", atrasoMinutos: null };
  const atraso = Math.floor((Date.now() - capturadoEm.getTime()) / 60_000);
  return {
    frescor:
      atraso <= 5 ? "ATUAL" : atraso <= 30 ? "RECENTE" : atraso <= 240 ? "DESATUALIZADA" : "SEM_SINAL",
    atrasoMinutos: atraso,
  };
}

export type SituacaoRastreador = {
  id: string;
  identificador: string;
  nome: string;
  tipo: string;
  ativo: boolean;
  /** descrição do que está sendo rastreado */
  alvo: string | null;
  veiculoId: string | null;
  placa: string | null;
  /** o técnico que esta posição representa, quando representa algum */
  tecnicoId: string | null;
  tecnicoNome: string | null;
  equipeNome: string | null;
  unidadeSerialId: string | null;
  serial: string | null;
  /** detentor do estoque associado, para conferir material em posse */
  detentorId: string | null;
  latitude: number | null;
  longitude: number | null;
  velocidade: number | null;
  ignicao: boolean | null;
  endereco: string | null;
  capturadoEm: Date | null;
  atrasoMinutos: number | null;
  frescor: Frescor;
};

/** 3.7 / 3.8 — situação de cada aparelho, com aviso de posição desatualizada. */
export async function situacaoDosRastreadores(): Promise<SituacaoRastreador[]> {
  const rastreadores = await prisma.rastreador.findMany({
    include: {
      veiculo: {
        include: {
          tecnicoAtual: { include: { equipe: true, detentor: true } },
          estoque: { include: { detentor: true } },
        },
      },
      tecnico: { include: { equipe: true, detentor: true } },
      unidadeSerial: { include: { material: { select: { nome: true } } } },
      posicoes: { orderBy: { capturadoEm: "desc" }, take: 1 },
    },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });

  return rastreadores.map((r) => {
    const posicao = r.posicoes[0] ?? null;
    const { frescor, atrasoMinutos } = classificarFrescor(
      posicao?.capturadoEm ?? null,
    );

    // para VEICULO a pessoa vem do vínculo; para PESSOA o aparelho já é dela
    const tecnico = r.tecnico ?? r.veiculo?.tecnicoAtual ?? null;

    return {
      id: r.id,
      identificador: r.identificador,
      nome: r.nome,
      tipo: r.tipo,
      ativo: r.ativo,
      alvo:
        r.veiculo?.placa ??
        r.tecnico?.nome ??
        (r.unidadeSerial
          ? `${r.unidadeSerial.material.nome} · ${r.unidadeSerial.serial}`
          : null),
      veiculoId: r.veiculoId,
      placa: r.veiculo?.placa ?? null,
      tecnicoId: tecnico?.id ?? null,
      tecnicoNome: tecnico?.nome ?? null,
      equipeNome: tecnico?.equipe?.nome ?? null,
      unidadeSerialId: r.unidadeSerialId,
      serial: r.unidadeSerial?.serial ?? null,
      detentorId:
        tecnico?.detentor?.id ?? r.veiculo?.estoque?.detentor?.id ?? null,
      latitude: posicao?.latitude ?? null,
      longitude: posicao?.longitude ?? null,
      velocidade: posicao?.velocidade ?? null,
      ignicao: posicao?.ignicao ?? null,
      endereco: posicao?.endereco ?? null,
      capturadoEm: posicao?.capturadoEm ?? null,
      atrasoMinutos,
      frescor,
    };
  });
}

/** compatibilidade: a frota é o recorte dos aparelhos instalados em veículos */
export async function situacaoDaFrota() {
  return (await situacaoDosRastreadores()).filter((r) => r.tipo === "VEICULO");
}

export type PosicaoDoTecnico = {
  tecnicoId: string;
  tecnicoNome: string;
  equipeNome: string | null;
  detentorId: string | null;
  latitude: number;
  longitude: number;
  /** CELULAR | VEICULO — de onde veio a coordenada */
  fonte: "CELULAR" | "VEICULO";
  referencia: string;
  capturadoEm: Date;
  atrasoMinutos: number | null;
  frescor: Frescor;
};

/**
 * 3.19 — ONDE CADA TÉCNICO ESTÁ.
 *
 * O celular ganha do veículo sempre que existir: ele é a pessoa, enquanto o
 * carro é só um lugar onde a pessoa provavelmente está. Quando o técnico
 * desce para atender, o carro fica parado na rua e o celular vai junto —
 * e é essa diferença que decide bem uma alocação.
 */
export async function posicoesDosTecnicos(): Promise<PosicaoDoTecnico[]> {
  const rastreadores = await situacaoDosRastreadores();

  const porTecnico = new Map<string, PosicaoDoTecnico>();

  for (const r of rastreadores) {
    if (r.tipo !== "PESSOA" && r.tipo !== "VEICULO") continue;
    if (!r.tecnicoId || r.latitude === null || r.longitude === null) continue;
    if (!r.capturadoEm) continue;

    const fonte = r.tipo === "PESSOA" ? "CELULAR" : "VEICULO";
    const candidato: PosicaoDoTecnico = {
      tecnicoId: r.tecnicoId,
      tecnicoNome: r.tecnicoNome!,
      equipeNome: r.equipeNome,
      detentorId: r.detentorId,
      latitude: r.latitude,
      longitude: r.longitude,
      fonte,
      referencia: r.alvo ?? r.nome,
      capturadoEm: r.capturadoEm,
      atrasoMinutos: r.atrasoMinutos,
      frescor: r.frescor,
    };

    const atual = porTecnico.get(r.tecnicoId);
    if (!atual) {
      porTecnico.set(r.tecnicoId, candidato);
      continue;
    }

    // celular vence veículo; entre iguais, vence a leitura mais recente
    const melhor =
      atual.fonte === candidato.fonte
        ? candidato.capturadoEm > atual.capturadoEm
          ? candidato
          : atual
        : candidato.fonte === "CELULAR"
          ? candidato
          : atual;

    porTecnico.set(r.tecnicoId, melhor);
  }

  return [...porTecnico.values()];
}

export async function historicoDoRastreador(rastreadorId: string, horas = 24) {
  const desde = new Date(Date.now() - horas * 3_600_000);
  return prisma.posicao.findMany({
    where: { rastreadorId, capturadoEm: { gte: desde } },
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
  const posicoes = await posicoesDosTecnicos();
  const resultado = [];

  for (const posicao of posicoes) {
    let temMaterial = true;
    const faltando: string[] = [];

    if (opcoes?.materiaisNecessarios?.length && posicao.detentorId) {
      for (const necessario of opcoes.materiaisNecessarios) {
        const saldo = await prisma.saldo.findUnique({
          where: {
            materialId_detentorId: {
              materialId: necessario.materialId,
              detentorId: posicao.detentorId,
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
      tecnicoId: posicao.tecnicoId,
      tecnicoNome: posicao.tecnicoNome,
      equipeNome: posicao.equipeNome,
      referencia: posicao.referencia,
      fonte: posicao.fonte,
      distanciaKm: distanciaKm(posicao, alvo),
      frescor: posicao.frescor,
      atrasoMinutos: posicao.atrasoMinutos,
      temMaterial,
      faltando,
    });
  }

  return resultado.sort((a, b) => a.distanciaKm - b.distanciaKm);
}

/** 1.x — onde está cada equipamento rastreado do patrimônio. */
export async function equipamentosRastreados() {
  return (await situacaoDosRastreadores()).filter(
    (r) => r.tipo === "EQUIPAMENTO",
  );
}
