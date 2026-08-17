"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { TIPO_ENTRADA } from "@/lib/dominio";
import { acaoCriarEntrada } from "@/app/acoes/estoque";
import { moeda, quantidade } from "@/lib/utils";
import { Aviso, Botao, Campo, Cartao, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

type Material = {
  id: string;
  nome: string;
  codigoInterno: string;
  unidadeMedida: string;
  controle: string;
  valorMedio: number;
  categoria: string;
};

type ItemForm = {
  chave: number;
  materialId: string;
  quantidade: string;
  valorUnitario: string;
  seriais: string;
};

let contador = 0;
const novoItem = (): ItemForm => ({
  chave: ++contador,
  materialId: "",
  quantidade: "",
  valorUnitario: "",
  seriais: "",
});

/**
 * 1.4 — NOVA ENTRADA.
 * Para material serializado, os seriais podem ser digitados ou colados um por
 * linha; a conferência no recebimento confirma quais realmente chegaram.
 */
export function FormularioEntrada({
  materiais,
  destinos,
  fornecedores,
}: {
  materiais: Material[];
  destinos: { id: string; nome: string; tipo: string }[];
  fornecedores: { id: string; nome: string }[];
}) {
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);

  const porId = new Map(materiais.map((m) => [m.id, m]));

  function atualizar(chave: number, campo: keyof ItemForm, valor: string) {
    setItens((atual) =>
      atual.map((item) =>
        item.chave === chave ? { ...item, [campo]: valor } : item,
      ),
    );
  }

  const itensValidos = itens.filter((i) => i.materialId && Number(i.quantidade) > 0);

  const total = itensValidos.reduce(
    (soma, item) => soma + Number(item.quantidade) * Number(item.valorUnitario || 0),
    0,
  );

  const payload = itensValidos.map((item) => {
    const material = porId.get(item.materialId)!;
    const seriais =
      material.controle === "SERIAL"
        ? item.seriais
            .split(/[\n,;]/)
            .map((s) => s.trim())
            .filter(Boolean)
            .map((serial) => ({ serial }))
        : undefined;

    return {
      materialId: item.materialId,
      quantidadePrevista: Number(item.quantidade),
      valorUnitario: item.valorUnitario ? Number(item.valorUnitario) : null,
      seriais: seriais?.length ? seriais : undefined,
    };
  });

  const avisosSerial = itensValidos
    .map((item) => {
      const material = porId.get(item.materialId)!;
      if (material.controle !== "SERIAL") return null;
      const total = item.seriais.split(/[\n,;]/).filter((s) => s.trim()).length;
      if (total === 0) return null;
      if (total === Number(item.quantidade)) return null;
      return `${material.nome}: ${total} serial(is) para ${item.quantidade} unidade(s).`;
    })
    .filter(Boolean) as string[];

  return (
    <FormularioAcao acao={acaoCriarEntrada} className="space-y-4">
      <input type="hidden" name="itens" value={JSON.stringify(payload)} />

      <Cartao titulo="Origem da entrada">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Tipo de entrada" obrigatorio>
            <select name="tipo" defaultValue="COMPRA" required>
              {TIPO_ENTRADA.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Estoque de destino" obrigatorio>
            <select name="destinoId" required defaultValue="">
              <option value="" disabled>
                Selecione…
              </option>
              {destinos.map((destino) => (
                <option key={destino.id} value={destino.id}>
                  {destino.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Fornecedor">
            <select name="fornecedorId" defaultValue="">
              <option value="">Não informado</option>
              {fornecedores.map((fornecedor) => (
                <option key={fornecedor.id} value={fornecedor.id}>
                  {fornecedor.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Documento / NF">
            <input name="documento" placeholder="NF 12345" />
          </Campo>
          <Campo rotulo="Lote">
            <input name="lote" />
          </Campo>
          <Campo rotulo="Observação" className="sm:col-span-2">
            <textarea name="observacao" rows={2} />
          </Campo>
        </div>
      </Cartao>

      <Cartao
        titulo="Materiais"
        descricao={`${itensValidos.length} item(ns) · previsto ${moeda(total)}`}
        acoes={
          <Botao
            type="button"
            onClick={() => setItens((a) => [...a, novoItem()])}
          >
            <Plus className="size-4" /> Adicionar item
          </Botao>
        }
      >
        <div className="space-y-3">
          {itens.map((item) => {
            const material = porId.get(item.materialId);
            const serializado = material?.controle === "SERIAL";
            const informados = item.seriais
              .split(/[\n,;]/)
              .filter((s) => s.trim()).length;

            return (
              <div
                key={item.chave}
                className="rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3"
              >
                <div className="grid gap-3 sm:grid-cols-12">
                  <Campo rotulo="Material" className="sm:col-span-5">
                    <select
                      value={item.materialId}
                      onChange={(e) =>
                        atualizar(item.chave, "materialId", e.target.value)
                      }
                    >
                      <option value="">Selecione…</option>
                      {materiais.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} ({m.codigoInterno})
                        </option>
                      ))}
                    </select>
                  </Campo>

                  <Campo
                    rotulo={`Quantidade${material ? ` (${material.unidadeMedida.toLowerCase()})` : ""}`}
                    className="sm:col-span-3"
                  >
                    <input
                      type="number"
                      step="any"
                      min={0}
                      value={item.quantidade}
                      onChange={(e) =>
                        atualizar(item.chave, "quantidade", e.target.value)
                      }
                    />
                  </Campo>

                  <Campo rotulo="Valor unitário" className="sm:col-span-3">
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      placeholder={material ? String(material.valorMedio) : ""}
                      value={item.valorUnitario}
                      onChange={(e) =>
                        atualizar(item.chave, "valorUnitario", e.target.value)
                      }
                    />
                  </Campo>

                  <div className="flex items-end sm:col-span-1">
                    <Botao
                      type="button"
                      variante="sutil"
                      aria-label="Remover item"
                      onClick={() =>
                        setItens((a) =>
                          a.length === 1
                            ? [novoItem()]
                            : a.filter((x) => x.chave !== item.chave),
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </Botao>
                  </div>
                </div>

                {serializado && (
                  <div className="mt-3">
                    <Campo
                      rotulo="Seriais"
                      dica={`Um por linha. ${informados} informado(s)${item.quantidade ? ` de ${item.quantidade}` : ""}. Pode ficar em branco e ser preenchido no recebimento.`}
                    >
                      <textarea
                        rows={3}
                        className="font-mono text-xs"
                        placeholder={"48575443ABC123\n48575443ABC124"}
                        value={item.seriais}
                        onChange={(e) =>
                          atualizar(item.chave, "seriais", e.target.value)
                        }
                      />
                    </Campo>
                  </div>
                )}

                {material && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Etiqueta tom="neutro">{material.categoria}</Etiqueta>
                    {serializado && <Etiqueta tom="roxo">serializado</Etiqueta>}
                    {Number(item.quantidade) > 0 && (
                      <Etiqueta tom="informativo">
                        {quantidade(Number(item.quantidade), material.unidadeMedida)}
                      </Etiqueta>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {avisosSerial.length > 0 && (
          <div className="mt-3">
            <Aviso tom="atencao" titulo="Confira a contagem de seriais">
              <ul className="list-inside list-disc">
                {avisosSerial.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </Aviso>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Recebimento">
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="receberImediatamente"
            className="mt-0.5 !w-auto"
          />
          <span>
            <span className="font-medium">Receber imediatamente</span>
            <span className="block text-xs text-[var(--texto-3)]">
              Use apenas quando a conferência física já foi feita. Sem isso, a
              entrada fica aguardando recebimento e o material não conta como
              disponível.
            </span>
          </span>
        </label>
      </Cartao>

      <div className="flex items-center gap-2">
        <BotaoEnviar>Lançar entrada</BotaoEnviar>
        <Link
          href="/entradas"
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)] hover:bg-[var(--superficie-3)]"
        >
          Cancelar
        </Link>
      </div>
    </FormularioAcao>
  );
}
