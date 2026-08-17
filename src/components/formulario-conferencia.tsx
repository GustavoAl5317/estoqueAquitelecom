"use client";

import { useState } from "react";
import { acaoReceberEntrada } from "@/app/acoes/estoque";
import { numero, quantidade } from "@/lib/utils";
import { Aviso, Campo, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

type ItemConferencia = {
  id: string;
  materialNome: string;
  unidadeMedida: string;
  controle: string;
  quantidadePrevista: number;
  seriaisPrevistos: string[];
};

type Estado = Record<string, { recebida: string; motivo: string; seriais: string }>;

/**
 * 1.5 / 1.6 — CONFERÊNCIA.
 * A quantidade recebida começa igual à prevista; qualquer alteração revela o
 * campo de motivo, que é obrigatório para registrar a divergência.
 */
export function FormularioConferencia({
  entradaId,
  itens,
}: {
  entradaId: string;
  itens: ItemConferencia[];
}) {
  const [estado, setEstado] = useState<Estado>(() =>
    Object.fromEntries(
      itens.map((item) => [
        item.id,
        {
          recebida: String(item.quantidadePrevista),
          motivo: "",
          seriais: item.seriaisPrevistos.join("\n"),
        },
      ]),
    ),
  );

  function atualizar(id: string, campo: keyof Estado[string], valor: string) {
    setEstado((atual) => ({ ...atual, [id]: { ...atual[id], [campo]: valor } }));
  }

  const payload = itens.map((item) => {
    const linha = estado[item.id];
    const seriais = linha.seriais
      .split(/[\n,;]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((serial) => ({ serial }));

    return {
      itemId: item.id,
      quantidadeRecebida: Number(linha.recebida || 0),
      motivo: linha.motivo || undefined,
      seriais: item.controle === "SERIAL" ? seriais : undefined,
    };
  });

  const pendencias = itens
    .map((item) => {
      const linha = estado[item.id];
      const recebida = Number(linha.recebida || 0);
      const diferenca = recebida - item.quantidadePrevista;

      if (diferenca !== 0 && !linha.motivo.trim()) {
        return `${item.materialNome}: informe o motivo da divergência.`;
      }
      if (item.controle === "SERIAL") {
        const total = linha.seriais.split(/[\n,;]/).filter((s) => s.trim()).length;
        if (total !== recebida) {
          return `${item.materialNome}: ${total} serial(is) para ${recebida} unidade(s) recebida(s).`;
        }
      }
      return null;
    })
    .filter(Boolean) as string[];

  return (
    <FormularioAcao acao={acaoReceberEntrada} className="space-y-4">
      <input type="hidden" name="entradaId" value={entradaId} />
      <input type="hidden" name="itens" value={JSON.stringify(payload)} />

      <div className="space-y-3">
        {itens.map((item) => {
          const linha = estado[item.id];
          const recebida = Number(linha.recebida || 0);
          const diferenca = recebida - item.quantidadePrevista;

          return (
            <div
              key={item.id}
              className="rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.materialNome}</span>
                {item.controle === "SERIAL" && (
                  <Etiqueta tom="roxo">serializado</Etiqueta>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Campo rotulo="Previsto">
                  <input
                    type="text"
                    disabled
                    value={quantidade(item.quantidadePrevista, item.unidadeMedida)}
                  />
                </Campo>
                <Campo rotulo="Recebido" obrigatorio>
                  <input
                    type="number"
                    step="any"
                    min={0}
                    value={linha.recebida}
                    onChange={(e) => atualizar(item.id, "recebida", e.target.value)}
                  />
                </Campo>
                <Campo rotulo="Divergência">
                  <input
                    type="text"
                    disabled
                    value={
                      diferenca === 0
                        ? "sem divergência"
                        : `${diferenca > 0 ? "+" : ""}${numero(diferenca, 2)}`
                    }
                    style={{
                      color:
                        diferenca === 0
                          ? undefined
                          : diferenca < 0
                            ? "var(--critico)"
                            : "var(--positivo)",
                    }}
                  />
                </Campo>
              </div>

              {diferenca !== 0 && (
                <div className="mt-3">
                  <Campo
                    rotulo="Motivo da divergência"
                    obrigatorio
                    dica="Fica registrado permanentemente no histórico da entrada."
                  >
                    <input
                      value={linha.motivo}
                      placeholder="Ex.: 4 peças chegaram avariadas no transporte"
                      onChange={(e) => atualizar(item.id, "motivo", e.target.value)}
                    />
                  </Campo>
                </div>
              )}

              {item.controle === "SERIAL" && (
                <div className="mt-3">
                  <Campo
                    rotulo="Seriais recebidos"
                    dica="Um por linha. Pode escanear direto neste campo."
                  >
                    <textarea
                      rows={3}
                      className="font-mono text-xs"
                      value={linha.seriais}
                      onChange={(e) => atualizar(item.id, "seriais", e.target.value)}
                    />
                  </Campo>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pendencias.length > 0 && (
        <Aviso tom="atencao" titulo="Antes de confirmar">
          <ul className="list-inside list-disc">
            {pendencias.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Aviso>
      )}

      <BotaoEnviar>Confirmar recebimento</BotaoEnviar>
    </FormularioAcao>
  );
}
