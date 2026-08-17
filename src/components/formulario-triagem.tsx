"use client";

import { useState } from "react";
import {
  ESTADO_FISICO,
  RESULTADO_SUGERIDO_POR_ESTADO,
  RESULTADO_TRIAGEM,
} from "@/lib/dominio";
import { acaoConcluirTriagem } from "@/app/acoes/estoque";
import { Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

/**
 * 1.12 — laudo da triagem.
 * O resultado já vem sugerido pelo estado em que o material foi devolvido, mas
 * a decisão é sempre do operador.
 */
export function FormularioTriagem({
  triagemId,
  estadoRecebido,
  destinos,
}: {
  triagemId: string;
  estadoRecebido: string | null;
  destinos: { id: string; nome: string }[];
}) {
  const sugerido =
    (estadoRecebido && RESULTADO_SUGERIDO_POR_ESTADO[estadoRecebido]) || "APROVADO";

  const [resultado, setResultado] = useState(sugerido);

  return (
    <FormularioAcao
      acao={acaoConcluirTriagem}
      className="w-full min-w-0 space-y-2 rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3 lg:w-96"
    >
      <input type="hidden" name="triagemId" value={triagemId} />

      <Campo rotulo="Resultado" obrigatorio>
        <select
          name="resultado"
          value={resultado}
          onChange={(e) => setResultado(e.target.value)}
        >
          {RESULTADO_TRIAGEM.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      {resultado === "APROVADO" && (
        <div className="grid grid-cols-2 gap-2">
          <Campo rotulo="Retorna para" obrigatorio>
            <select name="destinoId" required defaultValue={destinos[0]?.id ?? ""}>
              {destinos.map((destino) => (
                <option key={destino.id} value={destino.id}>
                  {destino.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Estado final">
            <select name="estadoFisico" defaultValue="BOM">
              {ESTADO_FISICO.opcoes
                .filter((o) => ["NOVO", "BOM", "USADO"].includes(o.valor))
                .map((opcao) => (
                  <option key={opcao.valor} value={opcao.valor}>
                    {opcao.rotulo}
                  </option>
                ))}
            </select>
          </Campo>
        </div>
      )}

      <Campo rotulo="Laudo">
        <textarea
          name="laudo"
          rows={2}
          placeholder={
            resultado === "APROVADO"
              ? "Testado e aprovado para reuso."
              : resultado === "MANUTENCAO"
                ? "Falha identificada, encaminhado para bancada."
                : "Sem condições de recuperação."
          }
        />
      </Campo>

      <BotaoEnviar variante={resultado === "DESCARTE" ? "perigo" : "primario"}>
        Concluir triagem
      </BotaoEnviar>
    </FormularioAcao>
  );
}
