"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus } from "lucide-react";
import {
  acaoClassificarRastreador,
  acaoCriarVeiculo,
  acaoRegistrarPosicao,
  acaoSalvarParametros,
  acaoVincularVeiculo,
} from "@/app/acoes/frota";
import { TIPO_RASTREADOR } from "@/lib/dominio";
import type { Parametros } from "@/lib/servicos/parametros";
import type { SituacaoRastreador } from "@/lib/servicos/frota";
import { numero, tempoRelativo } from "@/lib/utils";
import { Aviso, Botao, Campo, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

const FRESCOR = {
  ATUAL: { rotulo: "Atualizado", tom: "positivo" as const },
  RECENTE: { rotulo: "Recente", tom: "informativo" as const },
  DESATUALIZADA: { rotulo: "Desatualizada", tom: "atencao" as const },
  SEM_SINAL: { rotulo: "Sem sinal", tom: "critico" as const },
};

const CABECALHO =
  "border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-left text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]";
const CELULA = "border-b border-[var(--borda)] px-3 py-2.5";

/**
 * Quando não há alvo cadastrado, a tela diz o que criar em vez de mostrar um
 * seletor vazio. Um campo sem opção não comunica nada — parece defeito.
 */
const FALTA_CADASTRAR: Record<string, string> = {
  VEICULO: "cadastre um veículo ao lado",
  PESSOA: "cadastre o técnico em Locais e detentores",
  EQUIPAMENTO: "cadastre o equipamento como material serializado",
};

function opcoesDoTipo(tipo: string, alvos: AlvosDisponiveis) {
  if (tipo === "VEICULO") return alvos.veiculos;
  if (tipo === "PESSOA") return alvos.tecnicos;
  if (tipo === "EQUIPAMENTO") return alvos.seriais;
  return [];
}

export type AlvosDisponiveis = {
  veiculos: { id: string; placa: string; apelido: string | null }[];
  tecnicos: { id: string; nome: string; equipe: string | null }[];
  seriais: { id: string; rotulo: string }[];
};

/**
 * 3.1 — CLASSIFICAÇÃO DOS APARELHOS.
 *
 * A sincronização importa o que existe na plataforma e não arrisca palpite: a
 * conta da operação tem carro, celular de técnico e OTDR misturados, e
 * classificar por heurística de nome acertaria a maioria e erraria o suficiente
 * para alguém confiar num dado errado.
 *
 * Aqui uma pessoa resolve. São dois campos por linha — o que é, e a que
 * pertence — e a lista de alvos muda conforme o tipo escolhido.
 */
export function PainelRastreadores({
  rastreadores,
  alvos,
}: {
  rastreadores: SituacaoRastreador[];
  alvos: AlvosDisponiveis;
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  // guarda o tipo escolhido antes de existir alvo, para o segundo select aparecer
  const [rascunho, setRascunho] = useState<Record<string, string>>({});

  function classificar(
    rastreadorId: string,
    tipo: string,
    alvo: { veiculoId?: string; tecnicoId?: string; unidadeSerialId?: string },
  ) {
    setSalvando(rastreadorId);
    setErro(null);

    const dados = new FormData();
    dados.set("rastreadorId", rastreadorId);
    dados.set("tipo", tipo);
    for (const [chave, valor] of Object.entries(alvo)) {
      if (valor) dados.set(chave, valor);
    }

    iniciar(async () => {
      const resultado = await acaoClassificarRastreador({}, dados);
      setSalvando(null);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  if (rastreadores.length === 0) {
    return (
      <Aviso tom="atencao" titulo="Nenhum aparelho importado">
        Rode <code className="font-mono text-xs">npm run traccar -- --importar</code>{" "}
        para trazer os aparelhos da plataforma de rastreamento.
      </Aviso>
    );
  }

  const pendentes = rastreadores.filter((r) => r.tipo === "NAO_CLASSIFICADO");
  // classificados, mas sem saber a que pertencem — não entram na alocação
  const semVinculo = rastreadores.filter(
    (r) => r.tipo !== "NAO_CLASSIFICADO" && !r.alvo,
  );

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      {pendentes.length > 0 && (
        <Aviso
          tom="atencao"
          titulo={`${pendentes.length} aparelho(s) sem classificação`}
        >
          Enquanto ninguém disser o que são, eles reportam posição sem que o
          sistema saiba de quem é essa posição.
        </Aviso>
      )}

      {semVinculo.length > 0 && (
        <Aviso
          tom="informativo"
          titulo={`${semVinculo.length} aparelho(s) classificado(s), mas sem vínculo`}
        >
          O tipo já está salvo. Falta dizer a que cada um pertence — e isso
          exige que o veículo, o técnico ou o equipamento existam no cadastro.
        </Aviso>
      )}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr>
              {["Aparelho", "O que é", "A que pertence", "Posição", "Situação"].map(
                (titulo) => (
                  <th key={titulo} className={CABECALHO}>
                    {titulo}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rastreadores.map((r) => {
              const frescor = FRESCOR[r.frescor];
              const tipo = rascunho[r.id] ?? r.tipo;
              const ocupado = salvando === r.id;

              return (
                <tr key={r.id} className="hover:bg-[var(--superficie-2)]">
                  <td className={CELULA}>
                    <Link
                      href={`/rastreador/${r.id}`}
                      className="text-sm font-medium hover:text-[var(--acento)]"
                    >
                      {r.nome}
                    </Link>
                    <span className="block font-mono text-[11px] text-[var(--texto-3)]">
                      {r.identificador}
                    </span>
                  </td>

                  <td className={CELULA}>
                    <select
                      value={tipo}
                      disabled={ocupado}
                      onChange={(evento) => {
                        const novoTipo = evento.target.value;
                        setRascunho((atual) => ({ ...atual, [r.id]: novoTipo }));
                        // o tipo é um fato por si só: salva na hora, e o
                        // vínculo vira um segundo passo
                        classificar(r.id, novoTipo, {});
                      }}
                      className="!py-1 text-sm"
                      aria-label={`Tipo do aparelho ${r.nome}`}
                    >
                      {TIPO_RASTREADOR.opcoes.map((opcao) => (
                        <option key={opcao.valor} value={opcao.valor}>
                          {opcao.rotulo}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td className={CELULA}>
                    <div className="flex items-center gap-2">
                      {tipo === "NAO_CLASSIFICADO" ? (
                        <span className="text-xs text-[var(--texto-3)]">—</span>
                      ) : opcoesDoTipo(tipo, alvos).length === 0 ? (
                        <span className="text-xs text-[var(--atencao)]">
                          {FALTA_CADASTRAR[tipo]}
                        </span>
                      ) : (
                        <select
                          value={
                            tipo === "VEICULO"
                              ? (r.veiculoId ?? "")
                              : tipo === "PESSOA"
                                ? (r.tecnicoId ?? "")
                                : (r.unidadeSerialId ?? "")
                          }
                          disabled={ocupado}
                          onChange={(evento) =>
                            classificar(r.id, tipo, {
                              veiculoId:
                                tipo === "VEICULO" ? evento.target.value : undefined,
                              tecnicoId:
                                tipo === "PESSOA" ? evento.target.value : undefined,
                              unidadeSerialId:
                                tipo === "EQUIPAMENTO"
                                  ? evento.target.value
                                  : undefined,
                            })
                          }
                          className="!py-1 text-sm"
                          aria-label={`A que pertence o aparelho ${r.nome}`}
                        >
                          <option value="">— escolha —</option>
                          {tipo === "VEICULO" &&
                            alvos.veiculos.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.placa}
                                {v.apelido ? ` · ${v.apelido}` : ""}
                              </option>
                            ))}
                          {tipo === "PESSOA" &&
                            alvos.tecnicos.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.nome}
                                {t.equipe ? ` · ${t.equipe}` : ""}
                              </option>
                            ))}
                          {tipo === "EQUIPAMENTO" &&
                            alvos.seriais.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.rotulo}
                              </option>
                            ))}
                        </select>
                      )}
                      {ocupado && (
                        <Loader2 className="size-4 shrink-0 animate-spin text-[var(--texto-3)]" />
                      )}
                    </div>
                  </td>

                  <td className={CELULA}>
                    {r.latitude !== null ? (
                      <>
                        <span className="tabular font-mono text-xs">
                          {r.latitude.toFixed(5)}, {r.longitude!.toFixed(5)}
                        </span>
                        <span className="block text-xs text-[var(--texto-3)]">
                          {r.endereco ??
                            (r.velocidade !== null
                              ? `${numero(r.velocidade)} km/h`
                              : "—")}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--texto-3)]">
                        nenhuma posição recebida
                      </span>
                    )}
                  </td>

                  <td className={CELULA}>
                    <Etiqueta tom={frescor.tom} ponto>
                      {frescor.rotulo}
                    </Etiqueta>
                    {r.capturadoEm && (
                      <span className="block text-xs text-[var(--texto-3)]">
                        {tempoRelativo(r.capturadoEm)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--texto-3)]">
        Celular de técnico dispensa vínculo: a posição já é da pessoa. Carro
        precisa do motorista definido abaixo — senão a coordenada é do veículo e
        de mais ninguém.
      </p>
    </div>
  );
}

/**
 * 3.30 — quem está em qual veículo agora.
 *
 * Trocar o motorista é a operação mais frequente do dia, então ela acontece
 * direto na linha, sem abrir formulário.
 */
export function PainelFrota({
  frota,
  tecnicos,
}: {
  frota: SituacaoRastreador[];
  tecnicos: { id: string; nome: string; equipe: string | null }[];
}) {
  const router = useRouter();
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  function trocar(veiculoId: string, tecnicoId: string) {
    setSalvando(veiculoId);
    setErro(null);

    const dados = new FormData();
    dados.set("veiculoId", veiculoId);
    if (tecnicoId) dados.set("tecnicoId", tecnicoId);

    iniciar(async () => {
      const resultado = await acaoVincularVeiculo({}, dados);
      setSalvando(null);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  if (frota.length === 0) {
    return (
      <Aviso tom="atencao" titulo="Nenhum aparelho classificado como veículo">
        Classifique um aparelho como <strong>Veículo</strong> na tabela acima, ou
        cadastre o carro ao lado. Sem o vínculo carro ↔ técnico, a posição do
        rastreador não vira informação operacional.
      </Aviso>
    );
  }

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr>
              {["Veículo", "Quem está dirigindo", "Situação"].map((titulo) => (
                <th key={titulo} className={CABECALHO}>
                  {titulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frota.map((veiculo) => {
              const frescor = FRESCOR[veiculo.frescor];
              return (
                <tr key={veiculo.id} className="hover:bg-[var(--superficie-2)]">
                  <td className={CELULA}>
                    <span className="font-mono text-xs font-semibold">
                      {veiculo.placa ?? "sem placa"}
                    </span>
                    <span className="block text-xs text-[var(--texto-3)]">
                      {veiculo.nome}
                    </span>
                  </td>

                  <td className={CELULA}>
                    <div className="flex items-center gap-2">
                      <select
                        value={veiculo.tecnicoId ?? ""}
                        disabled={salvando === veiculo.veiculoId || !veiculo.veiculoId}
                        onChange={(evento) =>
                          trocar(veiculo.veiculoId!, evento.target.value)
                        }
                        className="!py-1 text-sm"
                        aria-label={`Motorista de ${veiculo.placa ?? veiculo.nome}`}
                      >
                        <option value="">— sem técnico —</option>
                        {tecnicos.map((tecnico) => (
                          <option key={tecnico.id} value={tecnico.id}>
                            {tecnico.nome}
                            {tecnico.equipe ? ` · ${tecnico.equipe}` : ""}
                          </option>
                        ))}
                      </select>
                      {salvando === veiculo.veiculoId && (
                        <Loader2 className="size-4 shrink-0 animate-spin text-[var(--texto-3)]" />
                      )}
                    </div>
                  </td>

                  <td className={CELULA}>
                    <Etiqueta tom={frescor.tom} ponto>
                      {frescor.rotulo}
                    </Etiqueta>
                    {veiculo.capturadoEm && (
                      <span className="block text-xs text-[var(--texto-3)]">
                        {tempoRelativo(veiculo.capturadoEm)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-[var(--texto-3)]">
        Toda troca de motorista fica registrada no histórico e na auditoria — é o
        que permite reconstruir quem estava onde em qualquer data.
      </p>
    </div>
  );
}

export function FormularioVeiculo({
  estoques,
}: {
  estoques: { id: string; nome: string }[];
}) {
  return (
    <FormularioAcao acao={acaoCriarVeiculo} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Placa" obrigatorio>
          <input name="placa" required placeholder="ABC1D23" className="uppercase" />
        </Campo>
        <Campo rotulo="Apelido">
          <input name="apelido" placeholder="VAN-04" />
        </Campo>
        <Campo rotulo="Modelo">
          <input name="modelo" placeholder="Fiorino" />
        </Campo>
        <Campo
          rotulo="ID no rastreador"
          dica="O uniqueId do aparelho. Pode ficar em branco e ser amarrado depois na tabela de aparelhos."
        >
          <input name="rastreador" placeholder="205047106" />
        </Campo>
        <Campo
          rotulo="Estoque do veículo"
          className="sm:col-span-2"
          dica="Vincule se o carro carrega material próprio."
        >
          <select name="estoqueId" defaultValue="">
            <option value="">Sem estoque próprio</option>
            {estoques.map((estoque) => (
              <option key={estoque.id} value={estoque.id}>
                {estoque.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <BotaoEnviar variante="secundario">
        <Plus className="size-4" /> Cadastrar veículo
      </BotaoEnviar>
    </FormularioAcao>
  );
}

/** Lançamento manual, para quando o aparelho estiver mudo. */
export function FormularioPosicao({
  rastreadores,
}: {
  rastreadores: { id: string; rotulo: string }[];
}) {
  if (rastreadores.length === 0) return null;

  return (
    <FormularioAcao acao={acaoRegistrarPosicao} className="space-y-3">
      <Campo rotulo="Aparelho" obrigatorio>
        <select name="rastreadorId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {rastreadores.map((rastreador) => (
            <option key={rastreador.id} value={rastreador.id}>
              {rastreador.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Latitude" obrigatorio>
          <input name="latitude" required placeholder="-3.7327" />
        </Campo>
        <Campo rotulo="Longitude" obrigatorio>
          <input name="longitude" required placeholder="-38.5762" />
        </Campo>
      </div>
      <Campo rotulo="Referência">
        <input name="endereco" placeholder="Ex.: Av. Bezerra de Menezes" />
      </Campo>
      <BotaoEnviar variante="secundario">
        <MapPin className="size-4" /> Lançar posição
      </BotaoEnviar>
    </FormularioAcao>
  );
}

/** 3.55 — pesos do score, alteráveis pelo supervisor. */
export function FormularioParametros({ atuais }: { atuais: Parametros }) {
  const [pesos, setPesos] = useState({
    pesoDistancia: atuais.pesoDistancia,
    pesoCarga: atuais.pesoCarga,
    pesoMaterial: atuais.pesoMaterial,
    pesoRegiao: atuais.pesoRegiao,
    pesoDisponibilidade: atuais.pesoDisponibilidade,
  });

  const soma = Object.values(pesos).reduce((s, v) => s + v, 0);

  const campos = [
    { chave: "pesoDistancia" as const, rotulo: "Distância" },
    { chave: "pesoDisponibilidade" as const, rotulo: "Disponibilidade" },
    { chave: "pesoCarga" as const, rotulo: "Carga de trabalho" },
    { chave: "pesoMaterial" as const, rotulo: "Material em posse" },
    { chave: "pesoRegiao" as const, rotulo: "Região de atuação" },
  ];

  return (
    <FormularioAcao
      acao={acaoSalvarParametros}
      className="space-y-4"
      aoConcluir={<Aviso tom="positivo">Parâmetros atualizados.</Aviso>}
    >
      <div className="space-y-3">
        {campos.map((campo) => (
          <div key={campo.chave}>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-[var(--texto-2)]">
                {campo.rotulo}
              </span>
              <span className="tabular text-xs text-[var(--texto-3)]">
                {pesos[campo.chave]} (
                {soma > 0 ? Math.round((pesos[campo.chave] / soma) * 100) : 0}% do
                total)
              </span>
            </div>
            <input
              type="range"
              name={campo.chave}
              min={0}
              max={50}
              value={pesos[campo.chave]}
              onChange={(evento) =>
                setPesos((atual) => ({
                  ...atual,
                  [campo.chave]: Number(evento.target.value),
                }))
              }
              className="!w-full !border-0 !bg-transparent !p-0"
            />
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Raio de atuação (km)">
          <input
            type="number"
            name="raioAtuacaoKm"
            min={1}
            step="0.5"
            defaultValue={atuais.raioAtuacaoKm}
          />
        </Campo>
        <Campo rotulo="Posição atual até (min)">
          <input
            type="number"
            name="minutosPosicaoAtual"
            min={1}
            defaultValue={atuais.minutosPosicaoAtual}
          />
        </Campo>
        <Campo rotulo="Parada suspeita (min)">
          <input
            type="number"
            name="minutosParadaSuspeita"
            min={5}
            defaultValue={atuais.minutosParadaSuspeita}
          />
        </Campo>
      </div>

      {/* 3.34 / 3.35 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          rotulo="Raio de chegada (m)"
          dica="Distância do endereço da OS a partir da qual o técnico é considerado no local."
        >
          <input
            type="number"
            name="raioChegadaMetros"
            min={20}
            step={10}
            defaultValue={atuais.raioChegadaMetros}
          />
        </Campo>
        <Campo
          rotulo="Ao detectar a chegada"
          dica="A chegada é sempre registrada na timeline; mover a situação sozinho é opcional."
        >
          <select name="moverAoChegar" defaultValue={String(atuais.moverAoChegar)}>
            <option value="0">Só registrar a chegada</option>
            <option value="1">Mover a OS para em atendimento</option>
          </select>
        </Campo>
      </div>

      <BotaoEnviar>Salvar parâmetros</BotaoEnviar>
    </FormularioAcao>
  );
}

export { Botao };
