import { prisma } from "@/lib/prisma";
import { ErroDeNegocio } from "./nucleo";
import { registrarPosicao, registrarRastreador } from "./frota";
import { avaliarGeofenceDoRastreador } from "./geofence";

/**
 * CONECTOR TRACCAR.
 *
 * A plataforma de rastreamento usada pela operação (rastreamentopopular.com)
 * roda Traccar 6.3 — open source, com API REST documentada. Isso dispensa
 * qualquer engenharia reversa: consultamos os dispositivos e as posições, e
 * gravamos aqui pelo mesmo caminho da ingestão por webhook.
 *
 * A amarração acontece por `uniqueId` do Traccar ↔ `identificador` do
 * rastreador aqui. O que o aparelho está rastreando — carro, celular de
 * técnico ou equipamento — é decisão humana, tomada na Central de Controle:
 * a sincronização importa o aparelho e para por aí.
 *
 * Essa recusa em adivinhar é deliberada. A conta da operação mistura carro,
 * celular pessoal e OTDR; classificar por heurística de nome acertaria a
 * maioria e erraria o suficiente para alguém confiar num dado errado.
 */

type Config = { url: string; cabecalhos: Record<string, string> };

export function configuracaoTraccar(): Config {
  const url = (process.env.TRACCAR_URL ?? "").replace(/\/+$/, "");
  const token = process.env.TRACCAR_TOKEN ?? "";
  const usuario = process.env.TRACCAR_USUARIO ?? "";
  const senha = process.env.TRACCAR_SENHA ?? "";

  if (!url) {
    throw new ErroDeNegocio(
      "TRACCAR_URL não configurada. Preencha o .env a partir do .env.example.",
    );
  }

  const cabecalhos: Record<string, string> = { Accept: "application/json" };

  if (token) {
    cabecalhos.Authorization = `Bearer ${token}`;
  } else if (usuario && senha) {
    cabecalhos.Authorization = `Basic ${Buffer.from(`${usuario}:${senha}`).toString("base64")}`;
  } else {
    throw new ErroDeNegocio(
      "Defina TRACCAR_USUARIO e TRACCAR_SENHA no .env (ou TRACCAR_TOKEN, se a conta oferecer).",
    );
  }

  return { url, cabecalhos };
}

async function consultar<T>(caminho: string): Promise<T> {
  const { url, cabecalhos } = configuracaoTraccar();
  const resposta = await fetch(`${url}${caminho}`, {
    headers: cabecalhos,
    cache: "no-store",
  });

  if (resposta.status === 401) {
    throw new ErroDeNegocio(
      "Traccar recusou a credencial. Confira TRACCAR_USUARIO e TRACCAR_SENHA no .env — são os mesmos do login no site.",
    );
  }
  if (!resposta.ok) {
    throw new ErroDeNegocio(
      `Traccar respondeu ${resposta.status} em ${caminho}: ${(await resposta.text()).slice(0, 160)}`,
    );
  }

  return resposta.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Tipos devolvidos pelo Traccar (apenas o que usamos)
// ---------------------------------------------------------------------------

export type DispositivoTraccar = {
  id: number;
  name: string;
  uniqueId: string;
  status: string; // online | offline | unknown
  lastUpdate: string | null;
  disabled?: boolean;
  model?: string | null;
  contact?: string | null;
};

export type PosicaoTraccar = {
  id: number;
  deviceId: number;
  latitude: number;
  longitude: number;
  /** o Traccar devolve velocidade em nós */
  speed: number;
  course: number;
  address: string | null;
  deviceTime: string;
  fixTime: string;
  serverTime: string;
  attributes?: Record<string, unknown>;
};

const NO_PARA_KMH = 1.852;

export async function listarDispositivos() {
  return consultar<DispositivoTraccar[]>("/api/devices");
}

export async function posicoesAtuais() {
  return consultar<PosicaoTraccar[]>("/api/positions");
}

export async function verificarConexao() {
  const servidor = await consultar<{ version?: string }>("/api/server");
  const dispositivos = await listarDispositivos();
  return {
    versao: servidor.version ?? "desconhecida",
    dispositivos: dispositivos.length,
    online: dispositivos.filter((d) => d.status === "online").length,
  };
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------

export type ResultadoSincronizacao = {
  dispositivos: number;
  posicoesRecebidas: number;
  posicoesGravadas: number;
  /** aparelhos que passaram a existir aqui nesta rodada */
  rastreadoresCriados: string[];
  /** aparelhos importados que ninguém classificou ainda */
  naoClassificados: { identificador: string; nome: string }[];
  erros: string[];
};

/**
 * Puxa dispositivos e posições do Traccar.
 *
 * Todo aparelho da conta vira um `Rastreador` aqui — inclusive os que não
 * interessam — porque só depois de existir é que alguém pode olhar a lista e
 * dizer o que é cada um. O que ele *não* faz é criar veículo: um OTDR virando
 * "veículo TRC-865011..." é o tipo de sujeira que ninguém limpa depois.
 */
export async function sincronizarPosicoes(
  opcoes: { importarNovos?: boolean } = {},
): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = {
    dispositivos: 0,
    posicoesRecebidas: 0,
    posicoesGravadas: 0,
    rastreadoresCriados: [],
    naoClassificados: [],
    erros: [],
  };

  const [dispositivos, posicoes] = await Promise.all([
    listarDispositivos(),
    posicoesAtuais(),
  ]);

  resultado.dispositivos = dispositivos.length;
  resultado.posicoesRecebidas = posicoes.length;

  const porId = new Map(dispositivos.map((d) => [d.id, d]));

  for (const posicao of posicoes) {
    const dispositivo = porId.get(posicao.deviceId);
    if (!dispositivo) continue;

    let rastreador = await prisma.rastreador.findUnique({
      where: { identificador: dispositivo.uniqueId },
    });

    if (!rastreador) {
      if (!opcoes.importarNovos) {
        resultado.naoClassificados.push({
          identificador: dispositivo.uniqueId,
          nome: dispositivo.name,
        });
        continue;
      }
      rastreador = await registrarRastreador({
        identificador: dispositivo.uniqueId,
        nome: dispositivo.name,
        modelo: dispositivo.model ?? null,
        ativo: !dispositivo.disabled,
      });
      resultado.rastreadoresCriados.push(
        `${dispositivo.name} (${dispositivo.uniqueId})`,
      );
    }

    if (rastreador.tipo === "NAO_CLASSIFICADO") {
      resultado.naoClassificados.push({
        identificador: rastreador.identificador,
        nome: rastreador.nome,
      });
    }

    // evita regravar a mesma leitura a cada ciclo
    const ultima = await prisma.posicao.findFirst({
      where: { rastreadorId: rastreador.id },
      orderBy: { capturadoEm: "desc" },
      select: { capturadoEm: true },
    });

    const capturadoEm = new Date(posicao.fixTime ?? posicao.deviceTime);
    if (ultima && capturadoEm <= ultima.capturadoEm) continue;

    try {
      await registrarPosicao({
        rastreadorId: rastreador.id,
        latitude: posicao.latitude,
        longitude: posicao.longitude,
        velocidade: Math.round(posicao.speed * NO_PARA_KMH),
        ignicao:
          typeof posicao.attributes?.ignition === "boolean"
            ? (posicao.attributes.ignition as boolean)
            : null,
        endereco: posicao.address,
        capturadoEm,
        origem: "RASTREADOR",
      });
      resultado.posicoesGravadas += 1;

      // 3.35 — a posição do aparelho também vale como chegada no cliente
      await avaliarGeofenceDoRastreador({
        rastreadorId: rastreador.id,
        latitude: posicao.latitude,
        longitude: posicao.longitude,
        capturadoEm,
      });
    } catch (erro) {
      resultado.erros.push(
        `${dispositivo.name}: ${erro instanceof Error ? erro.message : "falha"}`,
      );
    }
  }

  return resultado;
}

/** Importa o catálogo de aparelhos sem depender de haver posição para eles. */
export async function importarDispositivos() {
  const dispositivos = await listarDispositivos();
  const criados: string[] = [];

  for (const dispositivo of dispositivos) {
    const existente = await prisma.rastreador.findUnique({
      where: { identificador: dispositivo.uniqueId },
    });
    await registrarRastreador({
      identificador: dispositivo.uniqueId,
      nome: dispositivo.name,
      modelo: dispositivo.model ?? null,
      ativo: !dispositivo.disabled,
    });
    if (!existente) criados.push(`${dispositivo.name} (${dispositivo.uniqueId})`);
  }

  const pendentes = await prisma.rastreador.count({
    where: { tipo: "NAO_CLASSIFICADO" },
  });

  return { total: dispositivos.length, criados, pendentes };
}
