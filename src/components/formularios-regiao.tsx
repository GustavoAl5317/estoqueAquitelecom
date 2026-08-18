"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { acaoCriarRegiao, acaoSalvarBairro } from "@/app/acoes/operacao";
import { Botao, Campo } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

export type BairroEditavel = {
  id: string;
  nome: string;
  cidade: string;
  regiaoId: string | null;
  responsavelPrincipalId: string | null;
  responsavelSecundarioId: string | null;
  equipeId: string | null;
};

export function FormularioRegiao() {
  return (
    <FormularioAcao acao={acaoCriarRegiao} className="flex flex-wrap items-end gap-2">
      <Campo rotulo="Nome da região" className="min-w-48 flex-1">
        <input name="nome" placeholder="Região Sul 02" required />
      </Campo>
      <BotaoEnviar>
        <Plus className="size-4" aria-hidden /> Criar
      </BotaoEnviar>
    </FormularioAcao>
  );
}

/**
 * 3.25 — o bairro é a unidade de responsabilidade.
 *
 * Principal e reserva são pessoas diferentes de propósito: se fossem a mesma,
 * a operação ficaria sem plano B justo no dia em que o técnico faltar.
 */
export function FormularioBairro({
  regioes,
  tecnicos,
  equipes,
  bairro,
  aoFechar,
}: {
  regioes: { id: string; nome: string }[];
  tecnicos: { id: string; nome: string }[];
  equipes: { id: string; nome: string }[];
  bairro?: BairroEditavel;
  aoFechar?: () => void;
}) {
  return (
    <FormularioAcao acao={acaoSalvarBairro} className="space-y-3">
      {bairro && <input type="hidden" name="bairroId" value={bairro.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Bairro" obrigatorio>
          <input name="nome" defaultValue={bairro?.nome} required />
        </Campo>
        <Campo rotulo="Cidade" obrigatorio>
          <input name="cidade" defaultValue={bairro?.cidade ?? "Fortaleza"} required />
        </Campo>
        <Campo rotulo="Região">
          <select name="regiaoId" defaultValue={bairro?.regiaoId ?? ""}>
            <option value="">Sem região</option>
            {regioes.map((regiao) => (
              <option key={regiao.id} value={regiao.id}>
                {regiao.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Equipe">
          <select name="equipeId" defaultValue={bairro?.equipeId ?? ""}>
            <option value="">Sem equipe</option>
            {equipes.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Responsável principal">
          <select
            name="responsavelPrincipalId"
            defaultValue={bairro?.responsavelPrincipalId ?? ""}
          >
            <option value="">Sem responsável</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Reserva">
          <select
            name="responsavelSecundarioId"
            defaultValue={bairro?.responsavelSecundarioId ?? ""}
          >
            <option value="">Sem reserva</option>
            {tecnicos.map((tecnico) => (
              <option key={tecnico.id} value={tecnico.id}>
                {tecnico.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="flex gap-2">
        <BotaoEnviar>{bairro ? "Salvar bairro" : "Adicionar bairro"}</BotaoEnviar>
        {aoFechar && (
          <Botao type="button" variante="sutil" onClick={aoFechar}>
            Cancelar
          </Botao>
        )}
      </div>
    </FormularioAcao>
  );
}

/** edição em linha, para não tirar o supervisor da lista */
export function BairroEditavelEmLinha({
  bairro,
  regioes,
  tecnicos,
  equipes,
}: {
  bairro: BairroEditavel;
  regioes: { id: string; nome: string }[];
  tecnicos: { id: string; nome: string }[];
  equipes: { id: string; nome: string }[];
}) {
  const [aberto, setAberto] = useState(false);

  if (!aberto) {
    return (
      <Botao variante="sutil" onClick={() => setAberto(true)} aria-label="Editar bairro">
        <Pencil className="size-3.5" aria-hidden />
      </Botao>
    );
  }

  return (
    <div className="w-full rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3">
      <FormularioBairro
        bairro={bairro}
        regioes={regioes}
        tecnicos={tecnicos}
        equipes={equipes}
        aoFechar={() => setAberto(false)}
      />
    </div>
  );
}
