import { prisma } from "@/lib/prisma";
import { registrarEvento } from "./eventos";
import { configuracaoSgp } from "./sgp-config";

/**
 * 2.32 — GRAVAR NO SGP QUEM VAI ATENDER.
 *
 * O cliente quer que a atribuição feita aqui apareça no campo "Técnico
 * Responsável" da OS lá. A rota de escrita existe e é da mesma família que já
 * usamos para ler:
 *
 *     POST /api/central/chamado/update/{os_id}/   (form-data)
 *
 * O que a documentação pública lista para ela é `os_anotacao`, `os_observacao`,
 * `os_data_agendamento`, `os_status`, `ocorrencia_encerrar` e
 * `ocorrencia_conteudo` — **sem campo de técnico**. Mas essa documentação é de
 * um workspace de terceiros, apontando para a instância de demonstração, e o
 * SGP devolve `os_tecnico_responsavel` na leitura. Omissão de documentação e
 * limitação real dão exatamente na mesma aparência daqui.
 *
 * Por isso o campo é enviado e o resultado é **conferido relendo a OS**. Não se
 * conclui que gravou porque a resposta foi 200: conclui-se porque o valor
 * voltou diferente.
 *
 * ---
 *
 * Duas travas, porque escrever no sistema do cliente não perdoa engano:
 *
 * 1. **`os_status` e `ocorrencia_encerrar` não são montados em lugar nenhum
 *    deste arquivo.** Estão no mesmo corpo aceito pela rota, e mandar qualquer
 *    um deles por descuido encerraria a OS de um cliente real.
 *
 * 2. **Falhar aqui nunca desfaz a atribuição local.** O responsável já está
 *    gravado; avisar o SGP é consequência, e um timeout não pode fazer a OS
 *    voltar para a fila.
 */

/** "OS-31346" → "31346"; qualquer outra coisa → null */
export function osIdDoIdSgp(idSgp: string | null | undefined) {
  const casado = /^OS-(\d+)$/.exec((idSgp ?? "").trim());
  return casado ? casado[1] : null;
}

/**
 * O login com que este técnico é conhecido no SGP.
 *
 * Preferência para o que foi cadastrado à mão — é a única fonte que alguém
 * conferiu. Sem ele, cai no palpite: o nome que o próprio SGP mandou nas OS
 * deste técnico, em minúsculas. O palpite acerta quando o provedor cadastrou
 * login e nome iguais, que foi o caso de "igor" → "Igor"; quando erra, o SGP
 * devolve 404 e nada é alterado, então errar aqui é barato.
 */
export async function loginSgpDoTecnico(tecnicoId: string) {
  const tecnico = await prisma.tecnico.findUnique({
    where: { id: tecnicoId },
    select: { nome: true, loginSgp: true },
  });
  if (!tecnico) return { login: null, origem: "sem técnico" as const };
  if (tecnico.loginSgp?.trim()) {
    return { login: tecnico.loginSgp.trim(), origem: "cadastro" as const };
  }

  const doHistorico = await prisma.ordemServico.findFirst({
    where: { tecnicoId, tecnicoSgpNome: { not: null } },
    select: { tecnicoSgpNome: true },
    orderBy: { abertaEm: "desc" },
  });

  const bruto = doHistorico?.tecnicoSgpNome?.trim();
  if (!bruto) return { login: null, origem: "desconhecido" as const };
  return { login: bruto.toLowerCase(), origem: "palpite" as const };
}

export type ResultadoEscrita = {
  ok: boolean;
  /** o corpo exato enviado, sem as credenciais */
  corpo: Record<string, string>;
  url: string;
  httpStatus?: number;
  resposta?: string;
  motivo?: string;
};

/**
 * Escreve o responsável na OS do SGP.
 *
 * `simular` monta tudo e devolve sem tocar na rede — é como se confere o que
 * seria enviado antes de mandar para a produção do cliente.
 */
export async function gravarResponsavelNoSgp(
  ordem: { numero: string; idSgp: string | null },
  tecnicoNome: string,
  opcoes: { simular?: boolean } = {},
): Promise<ResultadoEscrita> {
  const osId = osIdDoIdSgp(ordem.idSgp);
  if (!osId) {
    return {
      ok: false,
      corpo: {},
      url: "",
      motivo: `A OS ${ordem.numero} não veio do SGP — não há o que atualizar lá.`,
    };
  }

  const { base, app, token } = configuracaoSgp();
  const url = `${base}/api/central/chamado/update/${osId}/`;
  const corpo = { os_tecnico_responsavel: tecnicoNome };

  if (opcoes.simular) {
    return { ok: false, corpo, url, motivo: "Simulação — nada foi enviado." };
  }

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ app, token, ...corpo }).toString(),
    cache: "no-store",
  });

  const texto = (await resposta.text()).slice(0, 500);

  return {
    ok: resposta.ok,
    corpo,
    url,
    httpStatus: resposta.status,
    resposta: texto,
    motivo: resposta.ok ? undefined : `SGP respondeu ${resposta.status}.`,
  };
}

/**
 * Lê de volta o responsável que o SGP tem para uma OS.
 *
 * É a prova. A rota de escrita pode devolver 200 e ignorar o campo em
 * silêncio — foi assim que `/api/os/list/` nos enganou por três rodadas.
 */
export type LinhaSgp = {
  os_id?: string | number;
  oc_protocolo?: string;
  os_status_descricao?: string;
  oc_status_descricao?: string;
  os_tecnico_responsavel?: string;
};

/** a listagem crua de um contrato — leitura, a rota que já usamos há semanas */
export async function listarContrato(
  contrato: string,
): Promise<{ linhas: LinhaSgp[]; erro?: string }> {
  const { base, app, token } = configuracaoSgp();

  const resposta = await fetch(`${base}/api/central/chamado/list/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ app, token, contrato }).toString(),
    cache: "no-store",
  });

  if (!resposta.ok) {
    return { linhas: [], erro: `SGP respondeu ${resposta.status} na leitura.` };
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    return {
      linhas: [],
      erro: `O SGP não devolveu uma lista para o contrato ${contrato}: ${JSON.stringify(dados).slice(0, 300)}`,
    };
  }
  return { linhas: dados as LinhaSgp[] };
}

export async function responsavelNoSgp(contrato: string, osId: string) {
  const { base, app, token } = configuracaoSgp();

  const resposta = await fetch(`${base}/api/central/chamado/list/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ app, token, contrato }).toString(),
    cache: "no-store",
  });

  if (!resposta.ok) return { erro: `SGP respondeu ${resposta.status} na leitura.` };

  /**
   * O SGP responde 200 com formatos diferentes.
   *
   * Quando dá certo vem um array. Quando não, vem objeto — `{"msg": "Contrato
   * não localizado", "status": 0}` é o caso conhecido. Tratar tudo que não é
   * array como lista vazia transforma a mensagem dele em "a OS não voltou",
   * que manda quem está diagnosticando procurar no lugar errado.
   */
  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    return {
      erro: `O SGP não devolveu uma lista para o contrato ${contrato}: ${JSON.stringify(dados).slice(0, 300)}`,
    };
  }

  const linha = dados.find(
    (c: { os_id?: string | number }) => String(c.os_id ?? "") === osId,
  );

  if (!linha) {
    const vistos = dados
      .map((c: { os_id?: string | number }) => String(c.os_id ?? "—"))
      .join(", ");
    return {
      erro:
        `OS ${osId} não está entre as ${dados.length} do contrato ${contrato}. ` +
        `O SGP devolveu: ${vistos || "nenhuma"}.`,
    };
  }
  return {
    responsavel: String(linha.os_tecnico_responsavel ?? ""),
    status: String(linha.os_status_descricao ?? ""),
  };
}

/**
 * O aviso ao SGP dentro do fluxo de atribuição.
 *
 * Engole a falha de propósito e registra o que aconteceu na linha do tempo da
 * OS — inclusive quando não deu certo. Quem abre a ordem precisa saber se o
 * SGP ficou sabendo; silêncio aqui viraria a suposição de que sempre foi
 * avisado.
 */
export async function avisarSgpDaAtribuicao(
  ordemId: string,
  usuarioId: string | null,
) {
  const ordem = await prisma.ordemServico.findUnique({
    where: { id: ordemId },
    select: {
      numero: true,
      idSgp: true,
      tecnicoId: true,
      tecnico: { select: { nome: true } },
    },
  });
  if (!ordem?.idSgp || !ordem.tecnicoId || !ordem.tecnico) return;

  const { login, origem } = await loginSgpDoTecnico(ordem.tecnicoId);

  if (!login) {
    await registrarEvento({
      ordemServicoId: ordemId,
      tipo: "OBSERVACAO",
      descricao:
        `SGP não avisado: ${ordem.tecnico.nome} não tem login do SGP no cadastro. ` +
        `Preencha em Configurações para a OS aparecer com responsável lá.`,
      usuarioId,
    });
    return;
  }

  try {
    const r = await gravarResponsavelNoSgp(ordem, login);
    await registrarEvento({
      ordemServicoId: ordemId,
      tipo: "OBSERVACAO",
      descricao: r.ok
        ? `SGP atualizado: ${ordem.tecnico.nome} como responsável (login "${login}").`
        : `Não foi possível atualizar o SGP (${r.motivo}${origem === "palpite" ? `, login "${login}" foi palpite` : ""}). O responsável aqui continua ${ordem.tecnico.nome}.`,
      usuarioId,
    });
  } catch (erro) {
    await registrarEvento({
      ordemServicoId: ordemId,
      tipo: "OBSERVACAO",
      descricao: `Não foi possível atualizar o SGP (${erro instanceof Error ? erro.message : "erro de rede"}). O responsável aqui continua ${ordem.tecnico.nome}.`,
      usuarioId,
    });
  }
}
