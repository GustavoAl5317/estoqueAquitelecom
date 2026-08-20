import { prisma } from "@/lib/prisma";
import { ErroDeNegocio } from "./nucleo";
import { registrarEvento } from "./eventos";
import { severidadeInicial } from "./severidade";
import { bairroDaCoordenada } from "./regioes";
import { rotuloDoTipo, todosTiposOS } from "./tipos-os";
import { normalizar } from "@/lib/utils";
import { STATUS_OS_ENCERRADOS } from "@/lib/dominio";

/**
 * 2.1 a 2.3 — SINCRONIZAÇÃO COM O SGP.
 *
 * O endpoint é `/api/central/chamado/list/`, e ele consulta **um contrato por
 * vez** — não existe listagem geral. Cada registro devolvido traz o chamado
 * (`oc_*`) e a ordem de serviço gerada a partir dele (`os_*`) na mesma linha.
 *
 * Duas decisões que valem registro:
 *
 * 1. **Só entra o que tem OS.** Chamado sem `os_id` é solicitação que ainda não
 *    virou trabalho de campo — financeiro, dúvida, liberação. Trazer isso
 *    encheria a fila de coisas que técnico nenhum vai atender.
 *
 * 2. **A OS local nunca é sobrescrita cegamente.** O que veio do SGP é
 *    atualizado; o que a operação decidiu aqui — responsável, prioridade — só
 *    muda se o SGP tiver um valor melhor. Sincronização que apaga decisão local
 *    faz o supervisor perder o trabalho do dia a cada rodada.
 */

/*
 * Os campos `os_*` chegam como string vazia quando não há OS, e como **número**
 * quando há. Tipar tudo como string fazia `.trim()` estourar exatamente no caso
 * que interessa — o de existir ordem de serviço.
 */
type ValorSgp = string | number | null;

type ChamadoSgp = {
  oc_protocolo: string;
  oc_tipo_id: number;
  oc_tipo_descricao: string;
  oc_data_cadastro: string;
  oc_data_encerramento: string;
  oc_conteudo: string;
  oc_status: number;
  oc_status_descricao: string;
  os_id: ValorSgp;
  os_conteudo: ValorSgp;
  os_servicoprestado: ValorSgp;
  os_observacao: ValorSgp;
  os_data_cadastro: ValorSgp;
  os_data_agendamento: ValorSgp;
  os_motivo_id: ValorSgp;
  os_motivo_descricao: ValorSgp;
  os_status: ValorSgp;
  os_status_descricao: ValorSgp;
  os_tecnico_responsavel: ValorSgp;
  os_tecnicos_auxiliares: ValorSgp;
  cliente: string;
  cliente_id: number;
  contrato_id: number;
  contrato_pop_id: number;
  contrato_pop: string;
  contrato_endereco_ll: string;
};

/** normaliza qualquer valor do SGP para texto aparado */
function texto(valor: ValorSgp | undefined) {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

function configuracao() {
  const base = (process.env.SGP_BASE_URL ?? process.env.SGP_URL ?? "").replace(
    /\/+$/,
    "",
  );
  const app = process.env.SGP_APP ?? "";
  const token = process.env.SGP_TOKEN ?? "";

  if (!base) throw new ErroDeNegocio("SGP_BASE_URL não configurada no .env.");
  if (!app || !token) {
    throw new ErroDeNegocio("SGP_APP e SGP_TOKEN precisam estar no .env.");
  }
  return { base, app, token };
}

/** o SGP fala form-data; JSON alguns endpoints ignoram em silêncio */
async function consultarContrato(contrato: number): Promise<ChamadoSgp[]> {
  const { base, app, token } = configuracao();

  const resposta = await fetch(`${base}/api/central/chamado/list/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ app, token, contrato: String(contrato) }).toString(),
    cache: "no-store",
  });

  if (resposta.status === 403) {
    // 403 aqui é limite de requisição, não falta de permissão — descobrimos do
    // jeito difícil, perseguindo permissão por três rodadas
    throw new ErroDeNegocio(
      "O SGP recusou por excesso de requisições. Aumente o intervalo entre as consultas.",
    );
  }
  if (!resposta.ok) {
    throw new ErroDeNegocio(
      `SGP respondeu ${resposta.status} ao consultar o contrato ${contrato}.`,
    );
  }

  const dados = await resposta.json();
  return Array.isArray(dados) ? dados : [];
}

// ---------------------------------------------------------------------------
// Tradução SGP → nosso domínio
// ---------------------------------------------------------------------------

/** "-3.7896,-38.4921" → coordenada, quando vier preenchido e válido */
function coordenada(bruto: ValorSgp | undefined) {
  const cru = texto(bruto);
  if (!cru) return { latitude: null, longitude: null };
  const [lat, lng] = cru.split(",").map((n) => Number(n.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { latitude: null, longitude: null };
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { latitude: null, longitude: null };
  }
  return { latitude: lat, longitude: lng };
}

/**
 * Data do SGP — que vem em **dois formatos diferentes na mesma resposta**.
 *
 * Os campos do chamado (`oc_*`) chegam em formato brasileiro, "20/08/2026
 * 11:31:24". Os da ordem de serviço (`os_*`) chegam em ISO,
 * "2026-08-20T00:00:00". Ler só o brasileiro fazia toda data de `os_*` virar
 * null em silêncio — e `agendadaPara` nunca era preenchida, o que derrubava o
 * filtro por agendamento e o roteiro do dia.
 *
 * Sem sufixo de fuso, o ISO é lido como hora local, que é o que o SGP quer
 * dizer: o horário é o de Fortaleza, não UTC.
 */
function dataBr(bruto: ValorSgp | undefined) {
  const cru = texto(bruto);
  if (!cru) return null;

  if (!cru.includes("/")) {
    const iso = new Date(cru);
    return Number.isNaN(iso.getTime()) ? null : iso;
  }

  const [dia, mes, resto] = cru.split("/");
  if (!dia || !mes || !resto) return null;
  const [ano, hora = "00:00:00"] = resto.split(" ");
  const data = new Date(`${ano}-${mes}-${dia}T${hora}`);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * 2.5 — o tipo da OS a partir do texto que o SGP usa.
 *
 * O provedor cadastra os motivos livremente, então não há lista fechada para
 * mapear. Casamos por palavra-chave e caímos em NAO_INFORMADO quando nada
 * bate — melhor uma OS sem tipo do que uma OS com o tipo errado.
 */
const PALAVRAS_POR_TIPO: [string, string[]][] = [
  ["INSTALACAO", ["instala", "ativa", "ponto novo"]],
  // "SUPORTE - Corretiva" é como o SGP desta operação nomeia reparo — o
  // vocabulário é livre por provedor, então o mapa cresce com o que aparece
  ["REPARO", [
    "sem cone", "sem sinal", "reparo", "lentid", "oscila", "queda", "defeito",
    "suporte", "corretiva", "atenua",
  ]],
  ["MANUTENCAO", ["manuten", "troca", "substitui"]],
  ["MUDANCA_ENDERECO", ["mudan", "transfer", "endere"]],
  ["RETIRADA", ["retirad", "cancelament", "desativa", "recolh"]],
  ["UPGRADE", ["upgrade", "aumento", "migra"]],
  ["VISTORIA", ["vistoria", "viabilidade", "visita"]],
  ["INFRAESTRUTURA", ["rompiment", "infra", "cabo", "caixa", "cto"]],
];

function tipoDoTexto(...valores: (ValorSgp | undefined)[]) {
  const alvo = valores.map(texto).filter(Boolean).join(" ").toLowerCase();
  for (const [tipo, palavras] of PALAVRAS_POR_TIPO) {
    if (palavras.some((p) => alvo.includes(p))) return tipo;
  }
  return "NAO_INFORMADO";
}

/** 2.11 — normaliza o status livre do SGP para o nosso ciclo de vida */
function statusDoTexto(bruto: ValorSgp | undefined) {
  const alvo = texto(bruto).toLowerCase();
  if (!alvo) return "ABERTA";
  if (alvo.includes("encerr") || alvo.includes("conclu") || alvo.includes("finaliz")) {
    return "CONCLUIDA";
  }
  if (alvo.includes("cancel")) return "CANCELADA";
  if (alvo.includes("execu") || alvo.includes("atendiment")) return "EM_ATENDIMENTO";
  if (alvo.includes("desloc") || alvo.includes("rota")) return "EM_DESLOCAMENTO";
  if (alvo.includes("agenda") || alvo.includes("atribu")) return "ATRIBUIDA";
  if (alvo.includes("pendent") || alvo.includes("aguard")) return "PENDENTE";
  return "ABERTA";
}

export type ResultadoSincronizacao = {
  contratosConsultados: number;
  chamadosRecebidos: number;
  semOrdemDeServico: number;
  criadas: number;
  atualizadas: number;
  semCoordenada: number;
  erros: string[];
};

/**
 * 2.4 — o técnico responsável que veio do SGP, casado com o cadastro daqui.
 *
 * O SGP manda o nome digitado por quem abriu a OS — texto livre, sem id. O
 * casamento é por nome normalizado (sem acento, sem caixa); não achando, a OS
 * entra sem responsável, como antes. Chutar o técnico errado é pior do que
 * deixar a supervisão atribuir.
 */
function acharTecnico(
  tecnicos: { id: string; nome: string }[],
  bruto: ValorSgp | undefined,
) {
  const alvo = normalizar(texto(bruto));
  if (!alvo) return null;
  return tecnicos.find((t) => normalizar(t.nome) === alvo) ?? null;
}

/**
 * Sincroniza os contratos informados.
 *
 * `intervaloMs` existe porque o SGP corta com 403 quando as chamadas vêm muito
 * juntas. Quatro segundos foi o que se mostrou estável nos testes.
 */
export async function sincronizarContratos(
  contratos: number[],
  opcoes: { intervaloMs?: number; usuarioId?: string } = {},
): Promise<ResultadoSincronizacao> {
  const intervalo = opcoes.intervaloMs ?? 4000;
  const tipos = await todosTiposOS();
  const tecnicos = await prisma.tecnico.findMany({
    where: { ativo: true },
    select: { id: true, nome: true },
  });
  const resultado: ResultadoSincronizacao = {
    contratosConsultados: 0,
    chamadosRecebidos: 0,
    semOrdemDeServico: 0,
    criadas: 0,
    atualizadas: 0,
    semCoordenada: 0,
    erros: [],
  };

  for (const [indice, contrato] of contratos.entries()) {
    if (indice > 0) await new Promise((r) => setTimeout(r, intervalo));

    let chamados: ChamadoSgp[];
    try {
      chamados = await consultarContrato(contrato);
      resultado.contratosConsultados += 1;
      resultado.chamadosRecebidos += chamados.length;
    } catch (erro) {
      resultado.erros.push(
        `contrato ${contrato}: ${erro instanceof Error ? erro.message : "falha"}`,
      );
      continue;
    }

    for (const chamado of chamados) {
      // sem OS não há trabalho de campo — não entra na fila
      const osId = texto(chamado.os_id);
      if (!osId) {
        resultado.semOrdemDeServico += 1;
        continue;
      }

      const idSgp = `OS-${osId}`;
      const tecnicoSgp = acharTecnico(tecnicos, chamado.os_tecnico_responsavel);
      const { latitude, longitude } = coordenada(chamado.contrato_endereco_ll);
      if (latitude === null) resultado.semCoordenada += 1;

      /*
       * 3.17 — o SGP manda coordenada e não manda bairro. Quando o contorno
       * está desenhado, a própria coordenada diz de quem é a área — e com o
       * bairro vêm o responsável e a região que o score usa.
       */
      const bairro =
        latitude !== null && longitude !== null
          ? await bairroDaCoordenada(latitude, longitude)
          : null;

      const abertaEm =
        dataBr(chamado.os_data_cadastro) ?? dataBr(chamado.oc_data_cadastro) ?? new Date();
      const status = statusDoTexto(chamado.os_status_descricao);
      const tipo = tipoDoTexto(
        chamado.os_motivo_descricao,
        chamado.os_servicoprestado,
        chamado.oc_tipo_descricao,
      );

      const existente = await prisma.ordemServico.findUnique({ where: { idSgp } });

      const comum = {
        tipo,
        subtipo: texto(chamado.os_motivo_descricao) || chamado.oc_tipo_descricao || null,
        titulo: texto(chamado.os_servicoprestado) || chamado.oc_tipo_descricao || null,
        descricao:
          [chamado.os_conteudo, chamado.os_observacao, chamado.oc_conteudo]
            .map(texto)
            .filter(Boolean)
            .join("\n\n") || null,
        cliente: chamado.cliente?.trim() || null,
        codigoCliente: String(chamado.cliente_id ?? ""),
        contrato: String(chamado.contrato_id ?? ""),
        cidade: chamado.contrato_pop?.trim() || null,
        // guardado mesmo sem técnico cadastrado: o dado é do SGP (2.4)
        tecnicoSgpNome: texto(chamado.os_tecnico_responsavel) || null,
        latitude,
        longitude,
        ...(bairro ? { bairroId: bairro.id, bairroNome: bairro.nome } : {}),
        status,
        agendadaPara: dataBr(chamado.os_data_agendamento),
        concluidaEm:
          status === "CONCLUIDA" ? dataBr(chamado.oc_data_encerramento) : null,
        origem: "SGP",
      };

      if (existente) {
        /*
         * Preserva a decisão local: prioridade e responsável são escolhas da
         * supervisão daqui, e o SGP não tem opinião melhor sobre elas.
         *
         * A exceção é a OS que ainda não tem responsável nenhum: aí o nome que
         * veio do SGP acrescenta, não sobrescreve.
         */
        const adotarTecnico =
          tecnicoSgp && !existente.tecnicoId
            ? { tecnicoId: tecnicoSgp.id }
            : {};

        /*
         * O andamento é daqui; o encerramento é do SGP.
         *
         * O SGP mantém a OS como "Aberta" durante todo o atendimento — quem
         * registra deslocamento, chegada e atendimento é esta plataforma.
         * Copiar o status a cada rodada devolvia o cartão para "Aberta" e
         * desfazia o trabalho do supervisor umas quatro vezes por hora.
         *
         * Então: fechamento e cancelamento vindos do SGP sempre valem; no
         * resto, o andamento local só cede se ainda não tiver saído do lugar.
         */
        const encerradoNoSgp = STATUS_OS_ENCERRADOS.includes(status);
        const andamentoLocal = !["ABERTA", ...STATUS_OS_ENCERRADOS].includes(
          existente.status,
        );

        const statusFinal = encerradoNoSgp
          ? status
          : andamentoLocal
            ? existente.status
            : tecnicoSgp || existente.tecnicoId
              ? "ATRIBUIDA"
              : status;

        await prisma.ordemServico.update({
          where: { id: existente.id },
          data: { ...comum, ...adotarTecnico, status: statusFinal },
        });
        resultado.atualizadas += 1;

        if (existente.status !== statusFinal) {
          await registrarEvento({
            ordemServicoId: existente.id,
            tipo: "STATUS",
            descricao: `Sincronização do SGP: ${texto(chamado.os_status_descricao) || "sem status"}.`,
            status: statusFinal,
            usuarioId: opcoes.usuarioId ?? null,
          });
        }
        continue;
      }

      const criada = await prisma.ordemServico.create({
        data: {
          ...comum,
          idSgp,
          numero: osId,
          abertaEm,
          prioridade: "P3",
          severidade: await severidadeInicial(tipo),
          // 2.4 — o responsável definido no SGP entra junto com a OS
          ...(tecnicoSgp
            ? {
                tecnicoId: tecnicoSgp.id,
                status: status === "ABERTA" ? "ATRIBUIDA" : status,
              }
            : {}),
        },
      });
      resultado.criadas += 1;

      await registrarEvento({
        ordemServicoId: criada.id,
        tipo: "RECEBIDA",
        descricao: `Importada do SGP — protocolo ${chamado.oc_protocolo}, ${rotuloDoTipo(tipos, tipo).toLowerCase()}.`,
        status,
        usuarioId: opcoes.usuarioId ?? null,
        ocorreuEm: abertaEm,
      });
    }
  }

  return resultado;
}

/**
 * Os contratos que já conhecemos, para a sincronização periódica.
 *
 * Como o SGP não expõe listagem geral, a base de contratos cresce pelo uso: o
 * que foi lançado à mão aqui e o que já veio de sincronizações anteriores.
 */
export async function contratosConhecidos(): Promise<number[]> {
  const ordens = await prisma.ordemServico.findMany({
    where: { contrato: { not: null } },
    select: { contrato: true },
    distinct: ["contrato"],
  });

  return [
    ...new Set(
      ordens
        .map((o) => Number(o.contrato))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ].sort((a, b) => a - b);
}

/** 2.2 — estado da última sincronização, para a tela mostrar. */
export async function estadoDaSincronizacao() {
  const registro = await prisma.configuracao.findUnique({
    where: { chave: "sgp.ultimaSincronizacao" },
  });
  const doSgp = await prisma.ordemServico.count({ where: { origem: "SGP" } });

  return {
    ultimaEm: registro ? new Date(registro.valor) : null,
    resumo: registro?.descricao ?? null,
    ordensDoSgp: doSgp,
    configurado: Boolean(process.env.SGP_TOKEN && process.env.SGP_APP),
  };
}

export async function marcarSincronizacao(resultado: ResultadoSincronizacao) {
  const resumo =
    `${resultado.contratosConsultados} contrato(s) · ${resultado.criadas} nova(s) · ` +
    `${resultado.atualizadas} atualizada(s)`;

  await prisma.configuracao.upsert({
    where: { chave: "sgp.ultimaSincronizacao" },
    create: {
      chave: "sgp.ultimaSincronizacao",
      valor: new Date().toISOString(),
      descricao: resumo,
    },
    update: { valor: new Date().toISOString(), descricao: resumo },
  });
}
