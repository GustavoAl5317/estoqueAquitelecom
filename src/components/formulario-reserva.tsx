"use client";

import { useState } from "react";
import { FINALIDADE_RESERVA } from "@/lib/dominio";
import { acaoCriarReserva } from "@/app/acoes/estoque";
import { Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

/** 1.14 — reserva vinculada a técnico, equipe, projeto ou OS. */
export function FormularioReserva({
  materiais,
  detentores,
  tecnicos,
  equipes,
}: {
  materiais: { id: string; nome: string; unidadeMedida: string }[];
  detentores: { id: string; nome: string }[];
  tecnicos: { id: string; nome: string }[];
  equipes: { id: string; nome: string }[];
}) {
  const [finalidade, setFinalidade] = useState("ORDEM_SERVICO");

  return (
    <FormularioAcao acao={acaoCriarReserva} className="space-y-3">
      <Campo rotulo="Material" obrigatorio>
        <select name="materialId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {materiais.map((material) => (
            <option key={material.id} value={material.id}>
              {material.nome}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Reservar em" obrigatorio>
        <select name="detentorId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {detentores.map((detentor) => (
            <option key={detentor.id} value={detentor.id}>
              {detentor.nome}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Quantidade" obrigatorio>
        <input type="number" step="any" min={0} name="quantidade" required />
      </Campo>

      <Campo rotulo="Finalidade" obrigatorio>
        <select
          name="finalidade"
          value={finalidade}
          onChange={(e) => setFinalidade(e.target.value)}
        >
          {FINALIDADE_RESERVA.opcoes.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </Campo>

      {(finalidade === "TECNICO" || finalidade === "ORDEM_SERVICO") && (
        <Campo rotulo="Técnico">
          <select name="tecnicoId" defaultValue="">
            <option value="">Não vincular</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {(finalidade === "EQUIPE" ||
        finalidade === "PROJETO" ||
        finalidade === "MANUTENCAO") && (
        <Campo rotulo="Equipe">
          <select name="equipeId" defaultValue="">
            <option value="">Não vincular</option>
            {equipes.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}

      <Campo rotulo="Expira em" dica="Opcional. Reservas vencidas geram alerta.">
        <input type="datetime-local" name="expiraEm" />
      </Campo>

      <Campo rotulo="Observação">
        <textarea name="observacao" rows={2} />
      </Campo>

      <BotaoEnviar>Reservar</BotaoEnviar>
    </FormularioAcao>
  );
}
