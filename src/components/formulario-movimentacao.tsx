"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPin, Plus, Trash2 } from "lucide-react";
import {
  ESTADO_FISICO,
  FINALIDADE,
  TIPOS_ESTOQUE_SISTEMA,
  TIPO_MOVIMENTACAO,
} from "@/lib/dominio";
import { acaoRegistrarMovimentacao } from "@/app/acoes/estoque";
import { numero, quantidade } from "@/lib/utils";
import { Aviso, Botao, Campo, Cartao, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

type Detentor = {
  id: string;
  nome: string;
  tipo: string;
  tipoEstoque: string | null;
};
type Material = {
  id: string;
  nome: string;
  codigoInterno: string;
  unidadeMedida: string;
  controle: string;
};
type Saldo = {
  materialId: string;
  detentorId: string;
  quantidade: number;
  reservado: number;
};
type Unidade = {
  id: string;
  serial: string;
  materialId: string;
  detentorId: string;
  status: string;
  estadoFisico: string;
};

type ItemForm = {
  chave: number;
  materialId: string;
  quantidade: string;
  seriaisIds: string[];
  estadoFisico: string;
};

let contador = 0;
const novoItem = (): ItemForm => ({
  chave: ++contador,
  materialId: "",
  quantidade: "",
  seriaisIds: [],
  estadoFisico: "",
});

/** finalidades que fazem sentido para cada tipo de movimentação */
const FINALIDADES_POR_TIPO: Record<string, string[]> = {
  SAIDA: ["TECNICO", "EQUIPE", "ORDEM_SERVICO", "INSTALACAO", "USO_INTERNO", "MANUTENCAO"],
  TRANSFERENCIA: ["TRANSFERENCIA", "EQUIPE", "TECNICO"],
  DEVOLUCAO: ["TECNICO", "EQUIPE", "RETIRADA_CLIENTE"],
  BAIXA: ["BAIXA", "PERDA", "DEFEITO"],
};

export function FormularioMovimentacao({
  detentores,
  materiais,
  saldos,
  unidades,
  usuarios,
  tipoInicial,
  origemInicial,
}: {
  detentores: Detentor[];
  materiais: Material[];
  saldos: Saldo[];
  unidades: Unidade[];
  usuarios: { id: string; nome: string }[];
  tipoInicial?: string;
  origemInicial?: string;
}) {
  const [tipo, setTipo] = useState(
    tipoInicial && TIPO_MOVIMENTACAO.inclui(tipoInicial) ? tipoInicial : "SAIDA",
  );
  const [finalidade, setFinalidade] = useState("TECNICO");
  const [origemId, setOrigemId] = useState(origemInicial ?? "");
  const [destinoId, setDestinoId] = useState("");
  const [itens, setItens] = useState<ItemForm[]>([novoItem()]);

  const materialPorId = useMemo(
    () => new Map(materiais.map((m) => [m.id, m])),
    [materiais],
  );

  const semDestino = finalidade === "INSTALACAO" || tipo === "BAIXA";
  const ehDevolucao = tipo === "DEVOLUCAO";

  const destinos = detentores.filter(
    (d) =>
      d.id !== origemId &&
      (!d.tipoEstoque || !TIPOS_ESTOQUE_SISTEMA.includes(d.tipoEstoque)),
  );

  /** o que a origem realmente tem disponível agora */
  const disponiveis = useMemo(() => {
    if (!origemId) return [];
    return saldos
      .filter((s) => s.detentorId === origemId && s.quantidade - s.reservado > 0)
      .map((s) => ({
        ...s,
        material: materialPorId.get(s.materialId)!,
        livre: s.quantidade - s.reservado,
      }))
      .filter((s) => s.material)
      .sort((a, b) => a.material.nome.localeCompare(b.material.nome));
  }, [origemId, saldos, materialPorId]);

  function atualizar(chave: number, mudanca: Partial<ItemForm>) {
    setItens((atual) =>
      atual.map((item) =>
        item.chave === chave ? { ...item, ...mudanca } : item,
      ),
    );
  }

  const itensValidos = itens.filter((item) => {
    const material = materialPorId.get(item.materialId);
    if (!material) return false;
    return material.controle === "SERIAL"
      ? item.seriaisIds.length > 0
      : Number(item.quantidade) > 0;
  });

  const payload = itensValidos.map((item) => {
    const material = materialPorId.get(item.materialId)!;
    return {
      materialId: item.materialId,
      quantidade:
        material.controle === "SERIAL"
          ? item.seriaisIds.length
          : Number(item.quantidade),
      seriaisIds: material.controle === "SERIAL" ? item.seriaisIds : undefined,
      estadoFisico: ehDevolucao && item.estadoFisico ? item.estadoFisico : undefined,
    };
  });

  const excedidos = itensValidos
    .map((item) => {
      const material = materialPorId.get(item.materialId)!;
      if (material.controle === "SERIAL") return null;
      const saldo = disponiveis.find((s) => s.materialId === item.materialId);
      const pedido = Number(item.quantidade);
      if (!saldo || pedido <= saldo.livre) return null;
      return `${material.nome}: disponível ${numero(saldo.livre, 2)}, solicitado ${numero(pedido, 2)}.`;
    })
    .filter(Boolean) as string[];

  const triagemProvavel =
    ehDevolucao &&
    itensValidos.some((item) => item.estadoFisico && item.estadoFisico !== "NOVO");

  return (
    <FormularioAcao acao={acaoRegistrarMovimentacao} className="space-y-4">
      <input type="hidden" name="itens" value={JSON.stringify(payload)} />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="finalidade" value={finalidade} />
      <input type="hidden" name="origemId" value={origemId} />
      {!semDestino && <input type="hidden" name="destinoId" value={destinoId} />}

      <Cartao titulo="Tipo de operação">
        <div className="grid gap-2 sm:grid-cols-4">
          {TIPO_MOVIMENTACAO.opcoes
            .filter((o) => o.valor !== "AJUSTE")
            .map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => {
                  setTipo(opcao.valor);
                  setFinalidade(FINALIDADES_POR_TIPO[opcao.valor][0]);
                }}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  tipo === opcao.valor
                    ? "border-[var(--acento)] bg-[var(--acento-suave)] font-medium text-[var(--acento-texto)]"
                    : "border-[var(--borda-forte)] hover:bg-[var(--superficie-3)]"
                }`}
              >
                {opcao.rotulo}
              </button>
            ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Finalidade" obrigatorio>
            <select
              value={finalidade}
              onChange={(e) => setFinalidade(e.target.value)}
            >
              {(FINALIDADES_POR_TIPO[tipo] ?? []).map((valor) => (
                <option key={valor} value={valor}>
                  {FINALIDADE.rotulo(valor)}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Solicitante">
            <select name="solicitanteId" defaultValue="">
              <option value="">Não informado</option>
              {usuarios.map((usuario) => (
                <option key={usuario.id} value={usuario.id}>
                  {usuario.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </Cartao>

      <Cartao titulo="Origem e destino">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Campo rotulo="Origem" obrigatorio>
            <select
              value={origemId}
              onChange={(e) => {
                setOrigemId(e.target.value);
                setItens([novoItem()]);
              }}
              required
            >
              <option value="">Selecione…</option>
              {detentores.map((detentor) => (
                <option key={detentor.id} value={detentor.id}>
                  {detentor.nome}
                </option>
              ))}
            </select>
          </Campo>

          <div className="hidden pb-2 text-[var(--texto-3)] sm:block">
            <ArrowRight className="size-4" />
          </div>

          <Campo rotulo="Destino" obrigatorio={!semDestino}>
            {semDestino ? (
              <input
                type="text"
                disabled
                value={
                  finalidade === "INSTALACAO"
                    ? "Cliente — sai do controle de saldo"
                    : "Baixa — sai do estoque"
                }
              />
            ) : (
              <select
                value={destinoId}
                onChange={(e) => setDestinoId(e.target.value)}
                required
              >
                <option value="">Selecione…</option>
                {destinos.map((detentor) => (
                  <option key={detentor.id} value={detentor.id}>
                    {detentor.nome}
                  </option>
                ))}
              </select>
            )}
          </Campo>
        </div>

        {/* 1.34 — vínculo leve com a OS: só número e cliente, sem depender do SGP */}
        {(finalidade === "ORDEM_SERVICO" || finalidade === "INSTALACAO") && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Campo
              rotulo="Número da OS"
              dica="Se a OS ainda não existir aqui, ela é criada com este número."
            >
              <input name="osNumero" placeholder="Ex.: 48291" />
            </Campo>
            <Campo rotulo="Cliente">
              <input name="osCliente" placeholder="Nome do cliente" />
            </Campo>
          </div>
        )}

        {finalidade === "INSTALACAO" && (
          <div className="mt-3">
            <Campo
              rotulo="Referência do cliente no equipamento"
              dica="Fica gravado na ficha do equipamento instalado."
            >
              <input name="clienteRef" placeholder="Ex.: CLI-4582 ou contrato 5510" />
            </Campo>
          </div>
        )}

        {ehDevolucao && (
          <div className="mt-3">
            <Campo
              rotulo="Passar por triagem"
              dica="Equipamento em estado diferente de novo, ou vindo de cliente, não volta direto ao estoque disponível."
            >
              <select name="exigirTriagem" defaultValue="auto">
                <option value="auto">Decidir pelo estado informado (recomendado)</option>
                <option value="sim">Sempre enviar para triagem</option>
                <option value="nao">Retornar direto ao estoque</option>
              </select>
            </Campo>
          </div>
        )}
      </Cartao>

      <Cartao
        titulo="Materiais"
        descricao={
          origemId
            ? `${disponiveis.length} material(is) disponível(is) na origem`
            : "Selecione a origem para ver o que há disponível"
        }
        acoes={
          <Botao
            type="button"
            disabled={!origemId}
            onClick={() => setItens((a) => [...a, novoItem()])}
          >
            <Plus className="size-4" /> Adicionar
          </Botao>
        }
      >
        {!origemId ? (
          <p className="py-6 text-center text-sm text-[var(--texto-3)]">
            Escolha a origem primeiro.
          </p>
        ) : disponiveis.length === 0 ? (
          <p className="py-6 text-center text-sm text-[var(--texto-3)]">
            Esta origem não possui saldo disponível.
          </p>
        ) : (
          <div className="space-y-3">
            {itens.map((item) => {
              const material = materialPorId.get(item.materialId);
              const serializado = material?.controle === "SERIAL";
              const saldo = disponiveis.find((s) => s.materialId === item.materialId);

              const unidadesDisponiveis = serializado
                ? unidades.filter(
                    (u) =>
                      u.materialId === item.materialId && u.detentorId === origemId,
                  )
                : [];

              return (
                <div
                  key={item.chave}
                  className="rounded-lg border border-[var(--borda)] bg-[var(--superficie-2)] p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-12">
                    <Campo rotulo="Material" className="sm:col-span-7">
                      <select
                        value={item.materialId}
                        onChange={(e) =>
                          atualizar(item.chave, {
                            materialId: e.target.value,
                            seriaisIds: [],
                            quantidade: "",
                          })
                        }
                      >
                        <option value="">Selecione…</option>
                        {disponiveis.map((s) => (
                          <option key={s.materialId} value={s.materialId}>
                            {s.material.nome} — {quantidade(s.livre, s.material.unidadeMedida)}
                          </option>
                        ))}
                      </select>
                    </Campo>

                    {!serializado && (
                      <Campo rotulo="Quantidade" className="sm:col-span-4">
                        <input
                          type="number"
                          step="any"
                          min={0}
                          max={saldo?.livre}
                          value={item.quantidade}
                          onChange={(e) =>
                            atualizar(item.chave, { quantidade: e.target.value })
                          }
                        />
                      </Campo>
                    )}

                    {serializado && (
                      <div className="flex items-end sm:col-span-4">
                        <Etiqueta tom="roxo">
                          {item.seriaisIds.length} selecionado(s)
                        </Etiqueta>
                      </div>
                    )}

                    <div className="flex items-end sm:col-span-1">
                      <Botao
                        type="button"
                        variante="sutil"
                        aria-label="Remover"
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
                      <p className="mb-1.5 text-xs font-semibold text-[var(--texto-2)]">
                        Selecione as unidades
                      </p>
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--borda)] bg-[var(--superficie)] p-2">
                        {unidadesDisponiveis.length === 0 ? (
                          <p className="p-2 text-xs text-[var(--texto-3)]">
                            Nenhuma unidade deste material na origem.
                          </p>
                        ) : (
                          <ul className="space-y-0.5">
                            {unidadesDisponiveis.map((unidade) => {
                              const marcado = item.seriaisIds.includes(unidade.id);
                              return (
                                <li key={unidade.id}>
                                  <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-[var(--superficie-3)]">
                                    <input
                                      type="checkbox"
                                      className="!w-auto"
                                      checked={marcado}
                                      onChange={() =>
                                        atualizar(item.chave, {
                                          seriaisIds: marcado
                                            ? item.seriaisIds.filter(
                                                (x) => x !== unidade.id,
                                              )
                                            : [...item.seriaisIds, unidade.id],
                                        })
                                      }
                                    />
                                    <span className="font-mono text-xs">
                                      {unidade.serial}
                                    </span>
                                    <Etiqueta
                                      tom={ESTADO_FISICO.tom(unidade.estadoFisico)}
                                      className="ml-auto"
                                    >
                                      {ESTADO_FISICO.rotulo(unidade.estadoFisico)}
                                    </Etiqueta>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {ehDevolucao && item.materialId && (
                    <div className="mt-3">
                      <Campo rotulo="Estado do material devolvido" obrigatorio>
                        <select
                          value={item.estadoFisico}
                          onChange={(e) =>
                            atualizar(item.chave, { estadoFisico: e.target.value })
                          }
                        >
                          <option value="">Selecione…</option>
                          {ESTADO_FISICO.opcoes.map((opcao) => (
                            <option key={opcao.valor} value={opcao.valor}>
                              {opcao.rotulo}
                            </option>
                          ))}
                        </select>
                      </Campo>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {excedidos.length > 0 && (
          <div className="mt-3">
            <Aviso tom="critico" titulo="Saldo insuficiente">
              <ul className="list-inside list-disc">
                {excedidos.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </Aviso>
          </div>
        )}

        {triagemProvavel && (
          <div className="mt-3">
            <Aviso tom="roxo" titulo="Este material irá para triagem">
              Como o estado informado é diferente de novo, o material fica na área
              de triagem até receber laudo — e só então volta a contar como estoque
              disponível.
            </Aviso>
          </div>
        )}
      </Cartao>

      <Cartao titulo="Justificativa">
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Motivo" obrigatorio={tipo === "BAIXA"}>
            <input
              name="motivo"
              required={tipo === "BAIXA"}
              placeholder="Ex.: retirada para atendimentos do dia"
            />
          </Campo>
          <Campo rotulo="Observação">
            <input name="observacao" />
          </Campo>
        </div>

        <div className="mt-3 border-t border-[var(--borda)] pt-3">
          <CoordenadaDaMovimentacao />
        </div>
      </Cartao>

      <div className="flex items-center gap-2">
        <BotaoEnviar>Registrar movimentação</BotaoEnviar>
        <Link
          href="/movimentacoes"
          className="rounded-lg px-3 py-1.5 text-sm text-[var(--texto-2)] hover:bg-[var(--superficie-3)]"
        >
          Cancelar
        </Link>
      </div>
    </FormularioAcao>
  );
}

/**
 * 1.35 — ONDE A MOVIMENTAÇÃO ACONTECEU.
 *
 * Material que sai para a rua sai de algum lugar, e no dia da divergência a
 * pergunta "onde isso foi lançado?" costuma não ter resposta. O navegador
 * responde em um clique.
 *
 * É opcional de propósito: o almoxarife lança do balcão, onde a coordenada não
 * acrescenta nada, e travar o formulário por causa dela atrasaria a operação
 * inteira para resolver um caso de exceção.
 */
function CoordenadaDaMovimentacao() {
  const [posicao, setPosicao] = useState<{
    latitude: number;
    longitude: number;
    precisao: number | null;
  } | null>(null);
  const [estado, setEstado] = useState<"parado" | "buscando" | "negado" | "indisponivel">(
    "parado",
  );

  function capturar() {
    if (!("geolocation" in navigator)) return setEstado("indisponivel");
    setEstado("buscando");

    navigator.geolocation.getCurrentPosition(
      (leitura) => {
        setPosicao({
          latitude: leitura.coords.latitude,
          longitude: leitura.coords.longitude,
          precisao: leitura.coords.accuracy ?? null,
        });
        setEstado("parado");
      },
      (erro) =>
        setEstado(erro.code === erro.PERMISSION_DENIED ? "negado" : "indisponivel"),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="latitude" value={posicao?.latitude ?? ""} />
      <input type="hidden" name="longitude" value={posicao?.longitude ?? ""} />

      <Botao
        variante="sutil"
        onClick={capturar}
        disabled={estado === "buscando"}
        type="button"
      >
        <MapPin className="size-4" aria-hidden />
        {posicao ? "Atualizar local" : "Registrar onde estou"}
      </Botao>

      <span className="text-xs text-[var(--texto-3)]">
        {estado === "buscando"
          ? "obtendo a localização…"
          : estado === "negado"
            ? "o navegador bloqueou a localização — o lançamento segue sem ela"
            : estado === "indisponivel"
              ? "localização indisponível neste aparelho"
              : posicao
                ? `${posicao.latitude.toFixed(5)}, ${posicao.longitude.toFixed(5)}${
                    posicao.precisao ? ` · ±${Math.round(posicao.precisao)} m` : ""
                  }`
                : "opcional — útil quando o lançamento é feito na rua"}
      </span>

      {posicao && (
        <Botao variante="sutil" type="button" onClick={() => setPosicao(null)}>
          Remover
        </Botao>
      )}
    </div>
  );
}
