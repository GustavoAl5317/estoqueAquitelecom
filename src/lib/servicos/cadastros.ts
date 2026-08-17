import { prisma } from "@/lib/prisma";
import { slugificar } from "@/lib/utils";
import { ErroDeNegocio, auditar } from "./nucleo";

// ---------------------------------------------------------------------------
// 1.2 — Materiais
// ---------------------------------------------------------------------------

export type DadosMaterial = {
  codigoInterno: string;
  nome: string;
  categoriaId: string;
  fabricante?: string | null;
  modelo?: string | null;
  unidadeMedida: string;
  controle: string;
  quantidadeMinima: number;
  quantidadeIdeal: number;
  valorMedio: number;
  codigoBarras?: string | null;
  descricao?: string | null;
  status: string;
};

export async function criarMaterial(dados: DadosMaterial, usuarioId: string) {
  const existente = await prisma.material.findUnique({
    where: { codigoInterno: dados.codigoInterno },
  });
  if (existente) {
    throw new ErroDeNegocio(
      `Já existe um material com o código ${dados.codigoInterno}.`,
    );
  }

  const material = await prisma.material.create({ data: dados });
  await auditar(prisma, {
    entidade: "Material",
    entidadeId: material.id,
    acao: "CRIACAO",
    descricao: `Material "${material.nome}" (${material.codigoInterno}) cadastrado.`,
    usuarioId,
    depois: dados,
  });
  return material;
}

export async function atualizarMaterial(
  id: string,
  dados: Partial<DadosMaterial>,
  usuarioId: string,
) {
  const antes = await prisma.material.findUnique({ where: { id } });
  if (!antes) throw new ErroDeNegocio("Material não encontrado.");

  if (dados.controle && dados.controle !== antes.controle) {
    const temMovimento = await prisma.movimento.findFirst({
      where: { materialId: id },
      select: { id: true },
    });
    if (temMovimento) {
      throw new ErroDeNegocio(
        "Não é possível alterar o tipo de controle de um material que já possui movimentações.",
      );
    }
  }

  const material = await prisma.material.update({ where: { id }, data: dados });
  await auditar(prisma, {
    entidade: "Material",
    entidadeId: id,
    acao: "EDICAO",
    descricao: `Material "${material.nome}" atualizado.`,
    usuarioId,
    antes,
    depois: dados,
  });
  return material;
}

// ---------------------------------------------------------------------------
// 1.2 — Categorias (expansíveis sem alteração estrutural)
// ---------------------------------------------------------------------------

export async function criarCategoria(
  dados: { nome: string; cor?: string },
  usuarioId: string,
) {
  const slug = slugificar(dados.nome);
  const existente = await prisma.categoria.findFirst({
    where: { OR: [{ nome: dados.nome }, { slug }] },
  });
  if (existente) throw new ErroDeNegocio("Esta categoria já existe.");

  const ultima = await prisma.categoria.findFirst({
    orderBy: { ordem: "desc" },
    select: { ordem: true },
  });

  const categoria = await prisma.categoria.create({
    data: {
      nome: dados.nome,
      slug,
      cor: dados.cor ?? "#64748b",
      ordem: (ultima?.ordem ?? 0) + 1,
    },
  });
  await auditar(prisma, {
    entidade: "Categoria",
    entidadeId: categoria.id,
    acao: "CRIACAO",
    descricao: `Categoria "${categoria.nome}" criada.`,
    usuarioId,
  });
  return categoria;
}

// ---------------------------------------------------------------------------
// 1.1 — Estoques (cada um ganha automaticamente seu Detentor)
// ---------------------------------------------------------------------------

export async function criarEstoque(
  dados: {
    nome: string;
    tipo: string;
    endereco?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    responsavelId?: string | null;
    status?: string;
  },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const estoque = await tx.estoque.create({
      data: {
        nome: dados.nome,
        tipo: dados.tipo,
        endereco: dados.endereco ?? null,
        latitude: dados.latitude ?? null,
        longitude: dados.longitude ?? null,
        responsavelId: dados.responsavelId ?? null,
        status: dados.status ?? "ATIVO",
      },
    });
    await tx.detentor.create({
      data: { tipo: "ESTOQUE", nome: estoque.nome, estoqueId: estoque.id },
    });
    await auditar(tx, {
      entidade: "Estoque",
      entidadeId: estoque.id,
      acao: "CRIACAO",
      descricao: `Estoque "${estoque.nome}" criado.`,
      usuarioId,
      depois: dados,
    });
    return estoque;
  });
}

export async function atualizarEstoque(
  id: string,
  dados: {
    nome?: string;
    tipo?: string;
    endereco?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    responsavelId?: string | null;
    status?: string;
  },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const antes = await tx.estoque.findUnique({ where: { id } });
    if (!antes) throw new ErroDeNegocio("Estoque não encontrado.");

    const estoque = await tx.estoque.update({ where: { id }, data: dados });
    if (dados.nome && dados.nome !== antes.nome) {
      await tx.detentor.updateMany({
        where: { estoqueId: id },
        data: { nome: dados.nome },
      });
    }
    await auditar(tx, {
      entidade: "Estoque",
      entidadeId: id,
      acao: "EDICAO",
      descricao: `Estoque "${estoque.nome}" atualizado.`,
      usuarioId,
      antes,
      depois: dados,
    });
    return estoque;
  });
}

// ---------------------------------------------------------------------------
// 1.8 / 1.9 — Técnicos e equipes também são detentores
// ---------------------------------------------------------------------------

export async function criarTecnico(
  dados: {
    nome: string;
    matricula: string;
    telefone?: string | null;
    equipeId?: string | null;
  },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const tecnico = await tx.tecnico.create({
      data: {
        nome: dados.nome,
        matricula: dados.matricula,
        telefone: dados.telefone ?? null,
        equipeId: dados.equipeId ?? null,
      },
    });
    await tx.detentor.create({
      data: { tipo: "TECNICO", nome: tecnico.nome, tecnicoId: tecnico.id },
    });
    await auditar(tx, {
      entidade: "Tecnico",
      entidadeId: tecnico.id,
      acao: "CRIACAO",
      descricao: `Técnico "${tecnico.nome}" cadastrado com estoque individual.`,
      usuarioId,
    });
    return tecnico;
  });
}

export async function criarEquipe(
  dados: { nome: string; tipo: string },
  usuarioId: string,
) {
  return prisma.$transaction(async (tx) => {
    const equipe = await tx.equipe.create({ data: dados });
    await tx.detentor.create({
      data: { tipo: "EQUIPE", nome: equipe.nome, equipeId: equipe.id },
    });
    await auditar(tx, {
      entidade: "Equipe",
      entidadeId: equipe.id,
      acao: "CRIACAO",
      descricao: `Equipe "${equipe.nome}" criada com estoque próprio.`,
      usuarioId,
    });
    return equipe;
  });
}

export async function criarFornecedor(dados: {
  nome: string;
  documento?: string | null;
  contato?: string | null;
}) {
  return prisma.fornecedor.create({ data: dados });
}
