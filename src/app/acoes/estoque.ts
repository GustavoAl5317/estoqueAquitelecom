"use server";

import { revalidatePath } from "next/cache";
import {
  sugerirVinculo,
  vincularOrdensDoNome,
} from "@/lib/servicos/vinculo-tecnico";
import { redirect } from "next/navigation";
import { z } from "zod";
import { usuarioAtual } from "@/lib/sessao";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";
import {
  criarCategoria,
  criarEquipe,
  criarEstoque,
  criarFornecedor,
  criarMaterial,
  criarTecnico,
  atualizarEstoque,
  atualizarMaterial,
} from "@/lib/servicos/cadastros";
import {
  cancelarEntrada,
  criarEntrada,
  receberEntrada,
  type ItemDeEntrada,
  type SerialInformado,
} from "@/lib/servicos/entradas";
import {
  registrarAjuste,
  registrarMovimentacao,
  registrarRetiradaDeCliente,
  type ItemMovimentacao,
} from "@/lib/servicos/movimentacoes";
import { concluirTriagem, iniciarAnalise } from "@/lib/servicos/triagem";
import { criarReserva, encerrarReserva } from "@/lib/servicos/reservas";
import {
  cancelarInventario,
  finalizarInventario,
  iniciarInventario,
  registrarContagem,
} from "@/lib/servicos/inventario";
import { salvarLimiares } from "@/lib/servicos/consultas";

export type Resultado = { erro?: string; ok?: boolean };

/** Converte exceções de regra de negócio em mensagem para o formulário. */
async function executar<T>(
  operacao: () => Promise<T>,
  caminhos: string[] = ["/"],
): Promise<Resultado & { dados?: T }> {
  try {
    const dados = await operacao();
    for (const caminho of caminhos) revalidatePath(caminho);
    return { ok: true, dados };
  } catch (erro) {
    if (erro instanceof ErroDeNegocio) return { erro: erro.message };
    if (erro instanceof z.ZodError) {
      return { erro: erro.issues.map((i) => i.message).join(" · ") };
    }
    console.error(erro);
    return {
      erro:
        erro instanceof Error
          ? erro.message
          : "Não foi possível concluir a operação.",
    };
  }
}

/**
 * Toda tela que oferece um técnico para escolher.
 *
 * `revalidatePath` não é opcional aqui: as páginas são `force-dynamic`, mas o
 * cache de rotas do cliente guarda o payload já renderizado. Sem invalidar,
 * quem acabou de cadastrar um técnico continua vendo a lista vazia que existia
 * antes — e conclui que o cadastro não funcionou.
 */
const TELAS_COM_TECNICO = [
  "/locais",
  "/configuracoes",
  "/os",
  "/os/quadro",
  "/os/nova",
  "/fila",
  "/decisao",
  "/roteiro",
  "/central",
  "/regioes",
];

const texto = (v: FormDataEntryValue | null) =>
  typeof v === "string" && v.trim() ? v.trim() : null;
const decimal = (v: FormDataEntryValue | null) => {
  const bruto = texto(v);
  if (!bruto) return 0;
  return Number(bruto.replace(/\./g, "").replace(",", ".")) || Number(bruto) || 0;
};

// ---------------------------------------------------------------------------
// 1.2 — Materiais
// ---------------------------------------------------------------------------

const esquemaMaterial = z.object({
  codigoInterno: z.string().min(1, "Informe o código interno."),
  nome: z.string().min(2, "Informe o nome do material."),
  categoriaId: z.string().min(1, "Selecione a categoria."),
  unidadeMedida: z.string().min(1),
  controle: z.enum(["QUANTIDADE", "SERIAL"]),
  quantidadeMinima: z.number().min(0),
  quantidadeIdeal: z.number().min(0),
  valorMedio: z.number().min(0),
  status: z.enum(["ATIVO", "INATIVO"]),
});

function lerMaterial(dados: FormData) {
  return {
    ...esquemaMaterial.parse({
      codigoInterno: String(dados.get("codigoInterno") ?? "").trim(),
      nome: String(dados.get("nome") ?? "").trim(),
      categoriaId: String(dados.get("categoriaId") ?? ""),
      unidadeMedida: String(dados.get("unidadeMedida") ?? "UN"),
      controle: String(dados.get("controle") ?? "QUANTIDADE"),
      quantidadeMinima: decimal(dados.get("quantidadeMinima")),
      quantidadeIdeal: decimal(dados.get("quantidadeIdeal")),
      valorMedio: decimal(dados.get("valorMedio")),
      status: String(dados.get("status") ?? "ATIVO"),
    }),
    fabricante: texto(dados.get("fabricante")),
    modelo: texto(dados.get("modelo")),
    codigoBarras: texto(dados.get("codigoBarras")),
    descricao: texto(dados.get("descricao")),
  };
}

export async function acaoCriarMaterial(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const resultado = await executar(
    () => criarMaterial(lerMaterial(dados), usuario.id),
    ["/materiais"],
  );
  if (resultado.ok && resultado.dados) redirect(`/materiais/${resultado.dados.id}`);
  return resultado;
}

export async function acaoAtualizarMaterial(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const id = String(dados.get("id"));
  const resultado = await executar(
    () => atualizarMaterial(id, lerMaterial(dados), usuario.id),
    ["/materiais", `/materiais/${id}`],
  );
  if (resultado.ok) redirect(`/materiais/${id}`);
  return resultado;
}

export async function acaoCriarCategoria(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      criarCategoria(
        {
          nome: String(dados.get("nome") ?? "").trim(),
          cor: texto(dados.get("cor")) ?? undefined,
        },
        usuario.id,
      ),
    ["/configuracoes", "/materiais"],
  );
}

// ---------------------------------------------------------------------------
// 1.1 / 1.8 / 1.9 — Locais, técnicos e equipes
// ---------------------------------------------------------------------------

export async function acaoCriarEstoque(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      criarEstoque(
        {
          nome: String(dados.get("nome") ?? "").trim(),
          tipo: String(dados.get("tipo") ?? "CENTRAL"),
          endereco: texto(dados.get("endereco")),
          latitude: texto(dados.get("latitude")) ? decimal(dados.get("latitude")) : null,
          longitude: texto(dados.get("longitude"))
            ? decimal(dados.get("longitude"))
            : null,
          responsavelId: texto(dados.get("responsavelId")),
          status: String(dados.get("status") ?? "ATIVO"),
        },
        usuario.id,
      ),
    ["/locais"],
  );
}

export async function acaoAtualizarEstoque(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const id = String(dados.get("id"));
  return executar(
    () =>
      atualizarEstoque(
        id,
        {
          nome: String(dados.get("nome") ?? "").trim(),
          tipo: String(dados.get("tipo") ?? "CENTRAL"),
          endereco: texto(dados.get("endereco")),
          latitude: texto(dados.get("latitude")) ? decimal(dados.get("latitude")) : null,
          longitude: texto(dados.get("longitude"))
            ? decimal(dados.get("longitude"))
            : null,
          responsavelId: texto(dados.get("responsavelId")),
          status: String(dados.get("status") ?? "ATIVO"),
        },
        usuario.id,
      ),
    ["/locais"],
  );
}

/**
 * 2.4 — cadastrar técnico recolhe as OS que já eram dele.
 *
 * A OS quase sempre chega do SGP antes de o técnico existir aqui, carregando
 * o nome do responsável como texto. Cadastrar sem olhar para isso deixaria o
 * trabalho dele órfão na fila e exigiria atribuição manual, uma a uma.
 *
 * Nome igual vincula direto. Nome parecido devolve uma pergunta em vez de
 * decidir: reatribuir OS por semelhança é escolha de gente, não de heurística.
 */
export type ResultadoTecnico = Resultado & {
  /** pergunta de nome parecido, quando o sistema não quer decidir sozinho */
  confirmar?: { nome: string; abertas: number; total: number };
  /** quantas OS do SGP passaram a ser deste técnico */
  vinculadas?: number;
};

export async function acaoCriarTecnico(
  _estado: ResultadoTecnico,
  dados: FormData,
): Promise<ResultadoTecnico> {
  const usuario = await usuarioAtual();
  const nome = String(dados.get("nome") ?? "").trim();

  // veio do "sim" da pergunta de nome parecido
  const nomeConfirmado = texto(dados.get("vincularNome"));

  if (nome && !nomeConfirmado) {
    const { exato, parecidos } = await sugerirVinculo(nome);
    if (!exato && parecidos.length === 1) {
      return { confirmar: parecidos[0] };
    }
  }

  const resultado = await executar(
    () =>
      criarTecnico(
        {
          nome,
          matricula: String(dados.get("matricula") ?? "").trim(),
          telefone: texto(dados.get("telefone")),
          equipeId: texto(dados.get("equipeId")),
        },
        usuario.id,
      ),
    TELAS_COM_TECNICO,
  );

  if (resultado.ok && resultado.dados) {
    // "-" é o "não, é outra pessoa": cadastra sem recolher OS de ninguém
    const alvo = nomeConfirmado === "-" ? nome : nomeConfirmado || nome;
    const { vinculadas } = await vincularOrdensDoNome(resultado.dados.id, alvo);
    for (const caminho of TELAS_COM_TECNICO) revalidatePath(caminho);
    return { ...resultado, vinculadas };
  }

  return resultado;
}

export async function acaoCriarEquipe(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      criarEquipe(
        {
          nome: String(dados.get("nome") ?? "").trim(),
          tipo: String(dados.get("tipo") ?? "INSTALACAO"),
        },
        usuario.id,
      ),
    TELAS_COM_TECNICO,
  );
}

export async function acaoCriarFornecedor(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(
    () =>
      criarFornecedor({
        nome: String(dados.get("nome") ?? "").trim(),
        documento: texto(dados.get("documento")),
        contato: texto(dados.get("contato")),
      }),
    ["/configuracoes", "/entradas/nova"],
  );
}

// ---------------------------------------------------------------------------
// 1.4 / 1.5 / 1.6 — Entradas
// ---------------------------------------------------------------------------

export async function acaoCriarEntrada(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const itens = JSON.parse(String(dados.get("itens") ?? "[]")) as ItemDeEntrada[];

  const resultado = await executar(
    () =>
      criarEntrada(
        {
          tipo: String(dados.get("tipo") ?? "COMPRA"),
          destinoId: String(dados.get("destinoId")),
          fornecedorId: texto(dados.get("fornecedorId")),
          documento: texto(dados.get("documento")),
          lote: texto(dados.get("lote")),
          observacao: texto(dados.get("observacao")),
          receberImediatamente: dados.get("receberImediatamente") === "on",
          itens,
        },
        usuario.id,
      ),
    ["/entradas", "/materiais", "/"],
  );

  if (resultado.ok && resultado.dados) redirect(`/entradas/${resultado.dados}`);
  return resultado;
}

export async function acaoReceberEntrada(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const entradaId = String(dados.get("entradaId"));
  const itens = JSON.parse(String(dados.get("itens") ?? "[]")) as {
    itemId: string;
    quantidadeRecebida: number;
    motivo?: string;
    seriais?: SerialInformado[];
  }[];

  return executar(() => receberEntrada({ entradaId, itens }, usuario.id), [
    "/entradas",
    `/entradas/${entradaId}`,
    "/materiais",
    "/",
  ]);
}

export async function acaoCancelarEntrada(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const entradaId = String(dados.get("entradaId"));
  return executar(
    () =>
      cancelarEntrada(
        entradaId,
        String(dados.get("motivo") ?? "Cancelada pelo operador"),
        usuario.id,
      ),
    ["/entradas", `/entradas/${entradaId}`],
  );
}

// ---------------------------------------------------------------------------
// 1.7 / 1.10 / 1.11 — Movimentações
// ---------------------------------------------------------------------------

export async function acaoRegistrarMovimentacao(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const itens = JSON.parse(String(dados.get("itens") ?? "[]")) as ItemMovimentacao[];
  const exigir = String(dados.get("exigirTriagem") ?? "auto");

  const resultado = await executar(
    () =>
      registrarMovimentacao(
        {
          tipo: String(dados.get("tipo") ?? "SAIDA"),
          finalidade: String(dados.get("finalidade") ?? "TECNICO"),
          origemId: String(dados.get("origemId")),
          destinoId: texto(dados.get("destinoId")),
          solicitanteId: texto(dados.get("solicitanteId")),
          motivo: texto(dados.get("motivo")),
          observacao: texto(dados.get("observacao")),
          clienteRef: texto(dados.get("clienteRef")),
          osNumero: texto(dados.get("osNumero")),
          osCliente: texto(dados.get("osCliente")),
          reservasIds: dados.getAll("reservasIds").map(String).filter(Boolean),
          exigirTriagem: exigir === "auto" ? undefined : exigir === "sim",
          itens,
        },
        usuario.id,
      ),
    ["/movimentacoes", "/materiais", "/locais", "/triagem", "/ordens", "/"],
  );

  if (resultado.ok && resultado.dados) {
    redirect(`/movimentacoes/${resultado.dados.id}`);
  }
  return resultado;
}

export async function acaoRetiradaDeCliente(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      registrarRetiradaDeCliente(
        {
          detentorId: String(dados.get("detentorId")),
          materialId: String(dados.get("materialId")),
          serial: texto(dados.get("serial")),
          quantidade: decimal(dados.get("quantidade")) || 1,
          estadoFisico: String(dados.get("estadoFisico") ?? "USADO"),
          clienteRef: texto(dados.get("clienteRef")),
          observacao: texto(dados.get("observacao")),
        },
        usuario.id,
      ),
    ["/triagem", "/locais", "/materiais", "/"],
  );
}

// ---------------------------------------------------------------------------
// 1.25 — Ajuste manual
// ---------------------------------------------------------------------------

export async function acaoAjustar(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      registrarAjuste(
        {
          detentorId: String(dados.get("detentorId")),
          materialId: String(dados.get("materialId")),
          quantidadeContada: decimal(dados.get("quantidadeContada")),
          motivo: String(dados.get("motivo") ?? ""),
        },
        usuario.id,
      ),
    ["/materiais", "/locais", "/auditoria", "/"],
  );
}

// ---------------------------------------------------------------------------
// 1.12 — Triagem
// ---------------------------------------------------------------------------

export async function acaoConcluirTriagem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      concluirTriagem(
        {
          triagemId: String(dados.get("triagemId")),
          resultado: String(dados.get("resultado") ?? "APROVADO"),
          laudo: texto(dados.get("laudo")),
          destinoId: texto(dados.get("destinoId")),
          estadoFisico: texto(dados.get("estadoFisico")),
        },
        usuario.id,
      ),
    ["/triagem", "/materiais", "/seriais", "/"],
  );
}

export async function acaoIniciarAnalise(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () => iniciarAnalise(String(dados.get("triagemId")), usuario.id),
    ["/triagem"],
  );
}

// ---------------------------------------------------------------------------
// 1.14 — Reservas
// ---------------------------------------------------------------------------

export async function acaoCriarReserva(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const expira = texto(dados.get("expiraEm"));
  return executar(
    () =>
      criarReserva(
        {
          materialId: String(dados.get("materialId")),
          detentorId: String(dados.get("detentorId")),
          quantidade: decimal(dados.get("quantidade")),
          finalidade: String(dados.get("finalidade") ?? "ORDEM_SERVICO"),
          tecnicoId: texto(dados.get("tecnicoId")),
          equipeId: texto(dados.get("equipeId")),
          observacao: texto(dados.get("observacao")),
          expiraEm: expira ? new Date(expira) : null,
        },
        usuario.id,
      ),
    ["/reservas", "/materiais", "/"],
  );
}

export async function acaoEncerrarReserva(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () =>
      encerrarReserva(
        String(dados.get("reservaId")),
        String(dados.get("status") ?? "CANCELADA") as "CANCELADA",
        usuario.id,
      ),
    ["/reservas", "/materiais", "/"],
  );
}

// ---------------------------------------------------------------------------
// 1.26 — Inventário
// ---------------------------------------------------------------------------

export async function acaoIniciarInventario(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const resultado = await executar(
    () =>
      iniciarInventario(
        {
          detentorId: String(dados.get("detentorId")),
          observacao: texto(dados.get("observacao")),
        },
        usuario.id,
      ),
    ["/inventario"],
  );
  if (resultado.ok && resultado.dados) redirect(`/inventario/${resultado.dados.id}`);
  return resultado;
}

export async function acaoRegistrarContagem(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const inventarioId = String(dados.get("inventarioId"));
  const itens = JSON.parse(String(dados.get("itens") ?? "[]")) as {
    itemId: string;
    quantidadeContada: number | null;
  }[];
  return executar(() => registrarContagem(itens), [
    "/inventario",
    `/inventario/${inventarioId}`,
  ]);
}

export async function acaoFinalizarInventario(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  const inventarioId = String(dados.get("inventarioId"));
  return executar(
    () =>
      finalizarInventario(
        { inventarioId, motivo: String(dados.get("motivo") ?? "") },
        usuario.id,
      ),
    ["/inventario", `/inventario/${inventarioId}`, "/materiais", "/"],
  );
}

export async function acaoCancelarInventario(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  const usuario = await usuarioAtual();
  return executar(
    () => cancelarInventario(String(dados.get("inventarioId")), usuario.id),
    ["/inventario"],
  );
}

// ---------------------------------------------------------------------------
// 1.16 — Regras configuráveis
// ---------------------------------------------------------------------------

export async function acaoSalvarLimiares(
  _estado: Resultado,
  dados: FormData,
): Promise<Resultado> {
  return executar(
    () =>
      salvarLimiares({
        normal: decimal(dados.get("normal")),
        atencao: decimal(dados.get("atencao")),
        critico: decimal(dados.get("critico")),
        diasMaterialParado: decimal(dados.get("diasMaterialParado")),
        desvioConsumo: decimal(dados.get("desvioConsumo")),
        diasAguardandoDevolucao: decimal(dados.get("diasAguardandoDevolucao")),
      }),
    ["/configuracoes", "/alertas", "/materiais", "/"],
  );
}
