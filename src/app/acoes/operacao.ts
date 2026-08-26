"use server";

import { revalidatePath } from "next/cache";
import { usuarioAtual } from "@/lib/sessao";
import { auditar, ErroDeNegocio } from "@/lib/servicos/nucleo";
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
import { distribuir } from "@/lib/servicos/distribuicao";
import { salvarParametros } from "@/lib/servicos/parametros";
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

/**
 * 4.11 — quem entra no rodízio, e quem atende cada tipo de OS.
 *
 * A operação pediu uma regra com nomes próprios: retirada de equipamento é de
 * uma pessoa só, o resto se reparte entre três, e quem coordena não recebe OS.
 * Nomes envelhecem — gente sai de férias, muda de função, é contratada. Por
 * isso a regra é cadastro, editável aqui, e não uma lista dentro do código que
 * só eu consigo mudar.
 */
export async function acaoSalvarDistribuicaoTecnico(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite mudar a distribuição de OS." };
  }

  const tecnicoId = String(dados.get("tecnicoId") ?? "");
  const recebeAutomatico = dados.get("recebeAutomatico") === "on";
  const tipos = dados.getAll("tipos").map(String).filter(Boolean);
  const loginSgp = String(dados.get("loginSgp") ?? "").trim() || null;

  return executar(async () => {
    const antes = await prisma.tecnico.findUnique({
      where: { id: tecnicoId },
      include: { tiposAtendidos: { select: { id: true, rotulo: true } } },
    });
    if (!antes) throw new ErroDeNegocio("Técnico não encontrado.");

    const atualizado = await prisma.tecnico.update({
      where: { id: tecnicoId },
      data: {
        recebeAutomatico,
        loginSgp,
        // `set` troca a lista inteira: o que não veio do formulário foi desmarcado
        tiposAtendidos: { set: tipos.map((id) => ({ id })) },
      },
      include: { tiposAtendidos: { select: { rotulo: true } } },
    });

    const lista = (t: { rotulo: string }[]) =>
      t.length ? t.map((x) => x.rotulo).join(", ") : "todos os tipos do rodízio";

    await auditar(prisma, {
      entidade: "Tecnico",
      entidadeId: tecnicoId,
      acao: "EDICAO",
      descricao: `Distribuição de ${antes.nome}: ${
        recebeAutomatico ? `recebe ${lista(atualizado.tiposAtendidos)}` : "não recebe OS automaticamente"
      }.`,
      usuarioId: usuario.id,
      antes: {
        recebeAutomatico: antes.recebeAutomatico,
        tipos: antes.tiposAtendidos.map((t) => t.rotulo),
      },
      depois: {
        recebeAutomatico,
        tipos: atualizado.tiposAtendidos.map((t) => t.rotulo),
      },
    });

    return atualizado;
  }, ["/configuracoes", ...TELAS_OS]);
}

/**
 * 4.11 — distribuir agora as OS que já estão abertas sem responsável.
 *
 * A automação cuida do que chega daqui para a frente. O que já estava na tela
 * antes de ela existir precisa de um empurrão manual, e é este botão.
 */
export async function acaoDistribuirAgora(
  _estado: Resultado,
  _dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "os.gerenciar")) {
    return { erro: "Seu perfil não permite distribuir ordens de serviço." };
  }

  return executar(() => distribuir(usuario.id), TELAS_OS);
}

/** 4.11 — liga e desliga a distribuição automática, sem depender de deploy. */
export async function acaoAlternarDistribuicaoAutomatica(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite mudar esta configuração." };
  }

  const ligar = String(dados.get("ligar") ?? "") === "1";

  return executar(async () => {
    await salvarParametros({ distribuicaoAutomatica: ligar ? 1 : 0 });
    await auditar(prisma, {
      entidade: "Configuracao",
      entidadeId: "operacao.distribuicaoAutomatica",
      acao: "EDICAO",
      descricao: `Distribuição automática de OS ${ligar ? "ligada" : "desligada"}.`,
      usuarioId: usuario.id,
      antes: { ligada: !ligar },
      depois: { ligada: ligar },
    });
  }, ["/configuracoes", ...TELAS_OS]);
}

/** 2.32 — liga e desliga a escrita do responsável no SGP. */
export async function acaoAlternarNotificacaoSgp(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  if (!podeFazer(usuario.papel, "sistema.administrar")) {
    return { erro: "Seu perfil não permite mudar esta configuração." };
  }

  const ligar = String(dados.get("ligar") ?? "") === "1";

  return executar(async () => {
    await salvarParametros({ notificarSgp: ligar ? 1 : 0 });
    await auditar(prisma, {
      entidade: "Configuracao",
      entidadeId: "operacao.notificarSgp",
      acao: "EDICAO",
      descricao: `Escrita do responsável no SGP ${ligar ? "ligada" : "desligada"}.`,
      usuarioId: usuario.id,
      antes: { ligada: !ligar },
      depois: { ligada: ligar },
    });
  }, ["/configuracoes", ...TELAS_OS]);
}
