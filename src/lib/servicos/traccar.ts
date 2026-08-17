import { prisma } from "@/lib/prisma";
import { ErroDeNegocio } from "./nucleo";
import { registrarPosicao } from "./frota";

/**
 * CONECTOR TRACCAR.
 *
 * A plataforma de rastreamento usada pela operação (rastreamentopopular.com)
 * roda Traccar 6.3 — open source, com API REST documentada. Isso dispensa
 * qualquer engenharia reversa: consultamos os dispositivos e as posições, e
 * gravamos aqui pelo mesmo caminho da ingestão por webhook.
 *
 * A amarração acontece por `uniqueId` do Traccar ↔ campo "ID no rastreador"
 * do veículo. Quando não bate, tentamos pela placa.
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
      "Defina TRACCAR_TOKEN (recomendado) ou TRACCAR_USUARIO e TRACCAR_SENHA no .env.",
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
      "Traccar recusou a credencial. Gere um token novo em Configurações → Conta → Token.",
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
  veiculosCriados: string[];
  semVinculo: { uniqueId: string; nome: string }[];
  erros: string[];
};

/**
 * Puxa as posições atuais e grava as que pertencem a veículos conhecidos.
 *
 * `criarVeiculos` cadastra automaticamente os dispositivos que ainda não
 * existem aqui — útil na primeira carga; depois disso, o normal é deixar
 * desligado para não poluir a frota com rastreadores de terceiros.
 */
export async function sincronizarPosicoes(
  opcoes: { criarVeiculos?: boolean } = {},
): Promise<ResultadoSincronizacao> {
  const resultado: ResultadoSincronizacao = {
    dispositivos: 0,
    posicoesRecebidas: 0,
    posicoesGravadas: 0,
    veiculosCriados: [],
    semVinculo: [],
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

    let veiculo = await prisma.veiculo.findFirst({
      where: {
        OR: [
          { rastreador: dispositivo.uniqueId },
          { placa: normalizarPlaca(dispositivo.name) },
        ],
      },
    });

    if (!veiculo && opcoes.criarVeiculos) {
      const placa = normalizarPlaca(dispositivo.name) || `TRC-${dispositivo.uniqueId}`;
      const jaExiste = await prisma.veiculo.findUnique({ where: { placa } });
      if (!jaExiste) {
        veiculo = await prisma.veiculo.create({
          data: {
            placa,
            apelido: dispositivo.name,
            modelo: dispositivo.model ?? null,
            rastreador: dispositivo.uniqueId,
            ativo: !dispositivo.disabled,
          },
        });
        resultado.veiculosCriados.push(`${placa} (${dispositivo.name})`);
      } else {
        veiculo = jaExiste;
      }
    }

    if (!veiculo) {
      resultado.semVinculo.push({
        uniqueId: dispositivo.uniqueId,
        nome: dispositivo.name,
      });
      continue;
    }

    // evita regravar a mesma leitura a cada ciclo
    const ultima = await prisma.posicaoVeiculo.findFirst({
      where: { veiculoId: veiculo.id },
      orderBy: { capturadoEm: "desc" },
      select: { capturadoEm: true },
    });

    const capturadoEm = new Date(posicao.fixTime ?? posicao.deviceTime);
    if (ultima && capturadoEm <= ultima.capturadoEm) continue;

    try {
      await registrarPosicao({
        veiculoId: veiculo.id,
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
    } catch (erro) {
      resultado.erros.push(
        `${dispositivo.name}: ${erro instanceof Error ? erro.message : "falha"}`,
      );
    }
  }

  return resultado;
}

/** "ABC-1D23" ou "abc1d23" viram "ABC1D23" */
function normalizarPlaca(texto: string | null | undefined) {
  if (!texto) return "";
  const limpo = texto.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(limpo) ? limpo : "";
}
