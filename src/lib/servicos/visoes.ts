import { prisma } from "@/lib/prisma";
import { ErroDeNegocio } from "./nucleo";

/**
 * 2.19 / 3.29 — VISÕES SALVAS.
 *
 * Todo supervisor tem quatro ou cinco recortes que ele abre todo dia. Obrigá-lo
 * a remontar o filtro cada vez é o tipo de atrito que faz a pessoa parar de
 * usar a ferramenta e voltar para a planilha.
 *
 * Guardamos a query string, não os campos: assim a visão continua funcionando
 * quando a tela ganhar um filtro novo, e quem lê o registro entende o que ela
 * faz sem precisar de um decodificador.
 */

export async function visoesDaTela(tela: string, usuarioId: string) {
  return prisma.visaoSalva.findMany({
    where: {
      tela,
      OR: [{ criadaPorId: usuarioId }, { compartilhada: true }],
    },
    include: { criadaPor: { select: { nome: true } } },
    orderBy: [{ compartilhada: "asc" }, { nome: "asc" }],
  });
}

export async function salvarVisao(dados: {
  nome: string;
  tela: string;
  filtros: string;
  compartilhada?: boolean;
  usuarioId: string;
}) {
  const nome = dados.nome.trim();
  if (!nome) throw new ErroDeNegocio("Dê um nome à visão.");

  // a query chega com "?" na frente quando vem do location.search
  const filtros = dados.filtros.replace(/^\?/, "");
  if (!filtros) {
    throw new ErroDeNegocio(
      "Não há filtro aplicado para salvar. Filtre a lista primeiro.",
    );
  }

  return prisma.visaoSalva.upsert({
    where: {
      criadaPorId_tela_nome: {
        criadaPorId: dados.usuarioId,
        tela: dados.tela,
        nome,
      },
    },
    create: {
      nome,
      tela: dados.tela,
      filtros,
      compartilhada: dados.compartilhada ?? false,
      criadaPorId: dados.usuarioId,
    },
    update: { filtros, compartilhada: dados.compartilhada ?? false },
  });
}

export async function apagarVisao(id: string, usuarioId: string) {
  const visao = await prisma.visaoSalva.findUnique({ where: { id } });
  if (!visao) throw new ErroDeNegocio("Visão não encontrada.");

  // quem criou é quem apaga, mesmo que a visão esteja compartilhada
  if (visao.criadaPorId !== usuarioId) {
    throw new ErroDeNegocio(
      "Só quem criou a visão pode apagá-la. Peça a essa pessoa, ou crie a sua.",
    );
  }

  await prisma.visaoSalva.delete({ where: { id } });
}

/**
 * A mesma lista, já no formato que a tela consome: quem criou aparece como
 * dono (e só ele vê o botão de apagar), e o nome do autor acompanha a visão
 * compartilhada para que ninguém precise adivinhar de onde ela veio.
 */
export async function visoesParaTela(tela: string, usuarioId: string) {
  const visoes = await visoesDaTela(tela, usuarioId);

  return visoes.map((visao) => ({
    id: visao.id,
    nome: visao.nome,
    filtros: visao.filtros,
    compartilhada: visao.compartilhada,
    minha: visao.criadaPorId === usuarioId,
    autor: visao.criadaPor.nome,
  }));
}
