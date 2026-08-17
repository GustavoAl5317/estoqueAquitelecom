"use client";

import Link from "next/link";
import { TIPO_CONTROLE, UNIDADE_MEDIDA } from "@/lib/dominio";
import { acaoAtualizarMaterial, acaoCriarMaterial } from "@/app/acoes/estoque";
import { Campo, Cartao } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

export type MaterialEditavel = {
  id: string;
  codigoInterno: string;
  nome: string;
  categoriaId: string;
  fabricante: string | null;
  modelo: string | null;
  unidadeMedida: string;
  controle: string;
  quantidadeMinima: number;
  quantidadeIdeal: number;
  valorMedio: number;
  codigoBarras: string | null;
  descricao: string | null;
  status: string;
};

export function FormularioMaterial({
  categorias,
  material,
  bloquearControle,
}: {
  categorias: { id: string; nome: string }[];
  material?: MaterialEditavel;
  bloquearControle?: boolean;
}) {
  const edicao = Boolean(material);

  return (
    <FormularioAcao
      acao={edicao ? acaoAtualizarMaterial : acaoCriarMaterial}
      className="space-y-4"
    >
      {material && <input type="hidden" name="id" value={material.id} />}

      <Cartao titulo="Identificação">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Código interno" obrigatorio>
            <input
              name="codigoInterno"
              defaultValue={material?.codigoInterno}
              placeholder="ONU-HW-8145"
              required
            />
          </Campo>
          <Campo rotulo="Nome" obrigatorio className="sm:col-span-1">
            <input
              name="nome"
              defaultValue={material?.nome}
              placeholder="ONU Huawei EG8145V5"
              required
            />
          </Campo>
          <Campo rotulo="Categoria" obrigatorio>
            <select name="categoriaId" defaultValue={material?.categoriaId} required>
              <option value="">Selecione…</option>
              {categorias.map((categoria) => (
                <option key={categoria.id} value={categoria.id}>
                  {categoria.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Status">
            <select name="status" defaultValue={material?.status ?? "ATIVO"}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo</option>
            </select>
          </Campo>
          <Campo rotulo="Fabricante">
            <input name="fabricante" defaultValue={material?.fabricante ?? ""} />
          </Campo>
          <Campo rotulo="Modelo">
            <input name="modelo" defaultValue={material?.modelo ?? ""} />
          </Campo>
          <Campo rotulo="Código de barras" className="sm:col-span-2">
            <input name="codigoBarras" defaultValue={material?.codigoBarras ?? ""} />
          </Campo>
          <Campo rotulo="Descrição" className="sm:col-span-2">
            <textarea name="descricao" rows={2} defaultValue={material?.descricao ?? ""} />
          </Campo>
        </div>
      </Cartao>

      <Cartao
        titulo="Controle"
        descricao="Define se o item é contado por quantidade ou rastreado unidade a unidade."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo
            rotulo="Tipo de controle"
            obrigatorio
            dica={
              bloquearControle
                ? "Não pode mudar: o material já possui movimentações."
                : undefined
            }
          >
            <select
              name="controle"
              defaultValue={material?.controle ?? "QUANTIDADE"}
              disabled={bloquearControle}
            >
              {TIPO_CONTROLE.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
            {bloquearControle && (
              <input type="hidden" name="controle" value={material?.controle} />
            )}
          </Campo>
          <Campo rotulo="Unidade de medida" obrigatorio>
            <select name="unidadeMedida" defaultValue={material?.unidadeMedida ?? "UN"}>
              {UNIDADE_MEDIDA.opcoes.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.rotulo}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Quantidade mínima" dica="Dispara o alerta de estoque baixo.">
            <input
              type="number"
              step="any"
              min={0}
              name="quantidadeMinima"
              defaultValue={material?.quantidadeMinima ?? 0}
            />
          </Campo>
          <Campo rotulo="Quantidade ideal" dica="Base do cálculo de criticidade.">
            <input
              type="number"
              step="any"
              min={0}
              name="quantidadeIdeal"
              defaultValue={material?.quantidadeIdeal ?? 0}
            />
          </Campo>
          <Campo
            rotulo="Valor médio (R$)"
            dica="Recalculado automaticamente a cada recebimento com valor."
          >
            <input
              type="number"
              step="0.01"
              min={0}
              name="valorMedio"
              defaultValue={material?.valorMedio ?? 0}
            />
          </Campo>
        </div>
      </Cartao>

      <div className="flex items-center gap-2">
        <BotaoEnviar>{edicao ? "Salvar alterações" : "Cadastrar material"}</BotaoEnviar>
        <Link
          href={material ? `/materiais/${material.id}` : "/materiais"}
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)] hover:bg-[var(--superficie-3)]"
        >
          Cancelar
        </Link>
      </div>
    </FormularioAcao>
  );
}
