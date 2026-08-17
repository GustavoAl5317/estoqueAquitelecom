"use client";

import { useState } from "react";
import {
  acaoFinalizarInventario,
  acaoIniciarInventario,
  acaoRegistrarContagem,
} from "@/app/acoes/estoque";
import { numero, quantidade } from "@/lib/utils";
import { Aviso, Campo, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

export function FormularioNovoInventario({
  detentores,
  detentorInicial,
}: {
  detentores: { id: string; nome: string }[];
  detentorInicial?: string;
}) {
  return (
    <FormularioAcao acao={acaoIniciarInventario} className="space-y-3">
      <Campo rotulo="Local a inventariar" obrigatorio>
        <select name="detentorId" required defaultValue={detentorInicial ?? ""}>
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
      <Campo rotulo="Observação">
        <textarea
          name="observacao"
          rows={2}
          placeholder="Ex.: contagem mensal do almoxarifado"
        />
      </Campo>
      <BotaoEnviar>Iniciar inventário</BotaoEnviar>
    </FormularioAcao>
  );
}

type ItemContagem = {
  id: string;
  materialNome: string;
  codigoInterno: string;
  unidadeMedida: string;
  serializado: boolean;
  quantidadeSistema: number;
  quantidadeContada: number | null;
};

/** 1.26 — folha de contagem com comparação ao vivo. */
export function FolhaDeContagem({
  inventarioId,
  itens,
  encerrado,
}: {
  inventarioId: string;
  itens: ItemContagem[];
  encerrado: boolean;
}) {
  const [contagens, setContagens] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      itens.map((item) => [
        item.id,
        item.quantidadeContada === null ? "" : String(item.quantidadeContada),
      ]),
    ),
  );

  const payload = itens.map((item) => ({
    itemId: item.id,
    quantidadeContada:
      contagens[item.id] === "" ? null : Number(contagens[item.id]),
  }));

  const preenchidos = payload.filter((p) => p.quantidadeContada !== null).length;
  const divergentes = itens.filter((item) => {
    const valor = contagens[item.id];
    if (valor === "") return false;
    return Number(valor) !== item.quantidadeSistema;
  });

  return (
    <div className="space-y-4">
      <FormularioAcao acao={acaoRegistrarContagem} className="space-y-3">
        <input type="hidden" name="inventarioId" value={inventarioId} />
        <input type="hidden" name="itens" value={JSON.stringify(payload)} />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr>
                <th className="border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-left text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                  Material
                </th>
                <th className="border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-right text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                  Sistema
                </th>
                <th className="w-32 border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-right text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                  Contagem
                </th>
                <th className="border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-right text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
                  Diferença
                </th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => {
                const valor = contagens[item.id];
                const diferenca =
                  valor === "" ? null : Number(valor) - item.quantidadeSistema;

                return (
                  <tr key={item.id}>
                    <td className="border-b border-[var(--borda)] px-3 py-2">
                      <span className="font-medium">{item.materialNome}</span>
                      <span className="block text-xs text-[var(--texto-3)]">
                        {item.codigoInterno}
                        {item.serializado && " · serializado"}
                      </span>
                    </td>
                    <td className="tabular border-b border-[var(--borda)] px-3 py-2 text-right">
                      {quantidade(item.quantidadeSistema, item.unidadeMedida)}
                    </td>
                    <td className="border-b border-[var(--borda)] px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        min={0}
                        disabled={encerrado}
                        className="text-right"
                        value={valor}
                        onChange={(e) =>
                          setContagens((atual) => ({
                            ...atual,
                            [item.id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                    <td className="tabular border-b border-[var(--borda)] px-3 py-2 text-right">
                      {diferenca === null ? (
                        <span className="text-[var(--texto-3)]">—</span>
                      ) : diferenca === 0 ? (
                        <Etiqueta tom="positivo">confere</Etiqueta>
                      ) : (
                        <span
                          className="font-medium"
                          style={{
                            color:
                              diferenca < 0 ? "var(--critico)" : "var(--positivo)",
                          }}
                        >
                          {diferenca > 0 ? "+" : ""}
                          {numero(diferenca, 2)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!encerrado && (
          <div className="flex flex-wrap items-center gap-3">
            <BotaoEnviar variante="secundario">Salvar contagem</BotaoEnviar>
            <span className="text-sm text-[var(--texto-3)]">
              {preenchidos} de {itens.length} contados ·{" "}
              {divergentes.length} divergência(s)
            </span>
          </div>
        )}
      </FormularioAcao>

      {!encerrado && (
        <FormularioAcao acao={acaoFinalizarInventario} className="space-y-3">
          <input type="hidden" name="inventarioId" value={inventarioId} />

          {preenchidos < itens.length ? (
            <Aviso tom="atencao">
              Ainda faltam {itens.length - preenchidos} material(is) a contar. Salve
              a contagem antes de finalizar.
            </Aviso>
          ) : divergentes.length > 0 ? (
            <Aviso tom="critico" titulo={`${divergentes.length} divergência(s)`}>
              Ao finalizar, cada uma vira um ajuste no histórico com o motivo
              informado abaixo.
            </Aviso>
          ) : (
            <Aviso tom="positivo" titulo="Contagem sem divergências">
              Nenhum ajuste será necessário.
            </Aviso>
          )}

          <Campo rotulo="Motivo dos ajustes" obrigatorio>
            <input
              name="motivo"
              required
              placeholder="Ex.: recontagem física confirmada pela equipe"
            />
          </Campo>

          <BotaoEnviar>Finalizar inventário</BotaoEnviar>
        </FormularioAcao>
      )}
    </div>
  );
}
