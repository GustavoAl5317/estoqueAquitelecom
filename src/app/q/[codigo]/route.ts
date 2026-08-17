import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

/**
 * 1.27 — destino da leitura.
 * Ao escanear a etiqueta, o identificador cai aqui e a ficha do equipamento
 * abre direto. Aceita serial, MAC, patrimônio ou código de barras.
 */
export async function GET(
  _requisicao: Request,
  contexto: { params: Promise<{ codigo: string }> },
) {
  const { codigo } = await contexto.params;
  const busca = decodeURIComponent(codigo).trim();

  const unidade = await prisma.unidadeSerial.findFirst({
    where: {
      OR: [
        { serial: busca },
        { macAddress: busca },
        { patrimonio: busca },
        { codigoBarras: busca },
      ],
    },
    select: { id: true },
  });

  if (unidade) redirect(`/seriais/${unidade.id}`);

  const material = await prisma.material.findFirst({
    where: { OR: [{ codigoInterno: busca }, { codigoBarras: busca }] },
    select: { id: true },
  });

  if (material) redirect(`/materiais/${material.id}`);

  // não encontrado: cai na busca global com o termo já preenchido
  redirect(`/escanear?q=${encodeURIComponent(busca)}&erro=1`);
}
