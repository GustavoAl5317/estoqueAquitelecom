import { NextResponse } from "next/server";
import { registrarPosicao } from "@/lib/servicos/frota";
import { avaliarGeofenceDoRastreador } from "@/lib/servicos/geofence";
import { ErroDeNegocio } from "@/lib/servicos/nucleo";

/**
 * Recepção de posições da plataforma de rastreamento.
 *
 * Aceita tanto um objeto quanto uma lista, e identifica o veículo por
 * `rastreador`, `placa` ou `veiculoId` — assim o mesmo endpoint serve para
 * webhook da plataforma e para o coletor que roda em intervalo.
 *
 * Protegido por segredo compartilhado: sem RASTREADOR_SEGREDO definido no
 * .env, o endpoint fica desligado — nunca aberto por engano.
 */

type Payload = {
  veiculoId?: string;
  placa?: string;
  rastreador?: string;
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lng?: number | string;
  velocidade?: number | string;
  ignicao?: boolean;
  endereco?: string;
  capturadoEm?: string;
};

function coordenada(valor: number | string | undefined) {
  if (valor === undefined || valor === null || valor === "") return NaN;
  return typeof valor === "number" ? valor : Number(String(valor).replace(",", "."));
}

export async function POST(requisicao: Request) {
  const segredo = process.env.RASTREADOR_SEGREDO;

  if (!segredo) {
    return NextResponse.json(
      {
        erro:
          "Ingestão desativada. Defina RASTREADOR_SEGREDO no .env para habilitar.",
      },
      { status: 503 },
    );
  }

  const enviado =
    requisicao.headers.get("x-rastreador-segredo") ??
    new URL(requisicao.url).searchParams.get("segredo");

  if (enviado !== segredo) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  let corpo: Payload | Payload[];
  try {
    corpo = await requisicao.json();
  } catch {
    return NextResponse.json({ erro: "Corpo inválido: esperado JSON." }, { status: 400 });
  }

  const lista = Array.isArray(corpo) ? corpo : [corpo];
  const aceitas: string[] = [];
  const recusadas: { item: number; motivo: string }[] = [];

  for (const [indice, item] of lista.entries()) {
    const latitude = coordenada(item.latitude ?? item.lat);
    const longitude = coordenada(item.longitude ?? item.lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      recusadas.push({ item: indice, motivo: "Latitude ou longitude ausente." });
      continue;
    }

    try {
      const posicao = await registrarPosicao({
        veiculoId: item.veiculoId,
        placa: item.placa,
        identificador: item.rastreador,
        latitude,
        longitude,
        velocidade:
          item.velocidade === undefined ? null : coordenada(item.velocidade),
        ignicao: item.ignicao ?? null,
        endereco: item.endereco ?? null,
        capturadoEm: item.capturadoEm ? new Date(item.capturadoEm) : undefined,
      });
      aceitas.push(posicao.id);

      // 3.35 — chegada no cliente detectada pela posição que acabou de entrar
      await avaliarGeofenceDoRastreador({
        rastreadorId: posicao.rastreadorId,
        latitude: posicao.latitude,
        longitude: posicao.longitude,
        capturadoEm: posicao.capturadoEm,
      });
    } catch (erro) {
      recusadas.push({
        item: indice,
        motivo:
          erro instanceof ErroDeNegocio
            ? erro.message
            : "Falha ao gravar a posição.",
      });
    }
  }

  return NextResponse.json(
    { aceitas: aceitas.length, recusadas },
    { status: recusadas.length && !aceitas.length ? 422 : 200 },
  );
}
