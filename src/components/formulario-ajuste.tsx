"use client";

import { useState } from "react";
import { acaoAjustar } from "@/app/acoes/estoque";
import { numero } from "@/lib/utils";
import { Aviso, Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

/**
 * 1.25 — AJUSTE MANUAL.
 * Mostra a diferença antes de confirmar e exige motivo; o lançamento entra no
 * histórico como AJUSTE DE INVENTÁRIO (1.24: nada muda em silêncio).
 */
export function FormularioAjuste({
  materialId,
  unidade,
  detentores,
}: {
  materialId: string;
  unidade: string;
  detentores: { id: string; nome: string; quantidade: number }[];
}) {
  const [detentorId, setDetentorId] = useState(detentores[0]?.id ?? "");
  const [contagem, setContagem] = useState("");

  const atual = detentores.find((d) => d.id === detentorId)?.quantidade ?? 0;
  const contado = contagem === "" ? null : Number(contagem.replace(",", "."));
  const diferenca = contado === null || Number.isNaN(contado) ? null : contado - atual;

  if (!detentores.length) {
    return (
      <p className="text-sm text-[var(--texto-3)]">
        Este material ainda não possui saldo em nenhum local.
      </p>
    );
  }

  return (
    <FormularioAcao acao={acaoAjustar} className="space-y-3">
      <input type="hidden" name="materialId" value={materialId} />

      <Campo rotulo="Local" obrigatorio>
        <select
          name="detentorId"
          value={detentorId}
          onChange={(e) => setDetentorId(e.target.value)}
        >
          {detentores.map((detentor) => (
            <option key={detentor.id} value={detentor.id}>
              {detentor.nome} — {numero(detentor.quantidade, 2)} {unidade.toLowerCase()}
            </option>
          ))}
        </select>
      </Campo>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Sistema">
          <input type="text" value={numero(atual, 2)} disabled />
        </Campo>
        <Campo rotulo="Contagem física" obrigatorio>
          <input
            type="number"
            step="any"
            min={0}
            name="quantidadeContada"
            value={contagem}
            onChange={(e) => setContagem(e.target.value)}
            required
          />
        </Campo>
      </div>

      {diferenca !== null && diferenca !== 0 && (
        <Aviso tom={diferenca < 0 ? "critico" : "atencao"}>
          Ajuste de{" "}
          <strong>
            {diferenca > 0 ? "+" : ""}
            {numero(diferenca, 2)}
          </strong>{" "}
          {unidade.toLowerCase()} será lançado no histórico.
        </Aviso>
      )}

      <Campo rotulo="Motivo" obrigatorio dica="Obrigatório e permanente no histórico.">
        <textarea
          name="motivo"
          rows={2}
          required
          placeholder="Ex.: recontagem física do turno da manhã"
        />
      </Campo>

      <BotaoEnviar variante="secundario">Registrar ajuste</BotaoEnviar>
    </FormularioAcao>
  );
}
