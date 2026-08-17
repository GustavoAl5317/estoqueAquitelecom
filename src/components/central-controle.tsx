"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus } from "lucide-react";
import {
  acaoCriarVeiculo,
  acaoRegistrarPosicao,
  acaoSalvarParametros,
  acaoVincularVeiculo,
} from "@/app/acoes/frota";
import type { Parametros } from "@/lib/servicos/parametros";
import type { SituacaoFrota } from "@/lib/servicos/frota";
import { numero, tempoRelativo } from "@/lib/utils";
import { Aviso, Botao, Campo, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";

const FRESCOR = {
  ATUAL: { rotulo: "Atualizado", tom: "positivo" as const },
  RECENTE: { rotulo: "Recente", tom: "informativo" as const },
  DESATUALIZADA: { rotulo: "Desatualizada", tom: "atencao" as const },
  SEM_SINAL: { rotulo: "Sem sinal", tom: "critico" as const },
};

/**
 * 3.30 — o painel central: quem está em qual veículo agora.
 * Trocar o motorista é a operação mais frequente do dia, então ela acontece
 * direto na linha, sem abrir formulário.
 */
export function PainelFrota({
  frota,
  tecnicos,
}: {
  frota: SituacaoFrota[];
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
      <Aviso tom="atencao" titulo="Nenhum veículo cadastrado">
        Cadastre os veículos ao lado. Enquanto não houver o vínculo veículo ↔
        técnico, a posição do rastreador não vira informação operacional.
      </Aviso>
    );
  }

  return (
    <div className="space-y-2">
      {erro && <Aviso tom="critico">{erro}</Aviso>}

      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr>
              {["Veículo", "Quem está dirigindo", "Posição", "Situação"].map((t) => (
                <th
                  key={t}
                  className="border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-left text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {frota.map((veiculo) => {
              const frescor = FRESCOR[veiculo.frescor];
              return (
                <tr key={veiculo.id} className="hover:bg-[var(--superficie-2)]">
                  <td className="border-b border-[var(--borda)] px-3 py-2.5">
                    <span className="font-mono text-xs font-semibold">
                      {veiculo.placa}
                    </span>
                    <span className="block text-xs text-[var(--texto-3)]">
                      {veiculo.apelido ?? veiculo.modelo ?? "—"}
                    </span>
                  </td>

                  <td className="border-b border-[var(--borda)] px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={veiculo.tecnicoId ?? ""}
                        disabled={salvando === veiculo.id}
                        onChange={(e) => trocar(veiculo.id, e.target.value)}
                        className="!py-1 text-sm"
                      >
                        <option value="">— sem técnico —</option>
                        {tecnicos.map((tecnico) => (
                          <option key={tecnico.id} value={tecnico.id}>
                            {tecnico.nome}
                            {tecnico.equipe ? ` · ${tecnico.equipe}` : ""}
                          </option>
                        ))}
                      </select>
                      {salvando === veiculo.id && (
                        <Loader2 className="size-4 shrink-0 animate-spin text-[var(--texto-3)]" />
                      )}
                    </div>
                  </td>

                  <td className="border-b border-[var(--borda)] px-3 py-2.5">
                    {veiculo.latitude !== null ? (
                      <>
                        <span className="tabular font-mono text-xs">
                          {veiculo.latitude.toFixed(5)}, {veiculo.longitude!.toFixed(5)}
                        </span>
                        <span className="block text-xs text-[var(--texto-3)]">
                          {veiculo.endereco ??
                            (veiculo.velocidade !== null
                              ? `${numero(veiculo.velocidade)} km/h`
                              : "—")}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-[var(--texto-3)]">
                        nenhuma posição recebida
                      </span>
                    )}
                  </td>

                  <td className="border-b border-[var(--borda)] px-3 py-2.5">
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
          dica="Como o veículo é identificado na plataforma de rastreamento."
        >
          <input name="rastreador" placeholder="100001" />
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

/** Lançamento manual, para quando o rastreador estiver mudo. */
export function FormularioPosicao({
  veiculos,
}: {
  veiculos: { id: string; placa: string }[];
}) {
  if (veiculos.length === 0) return null;

  return (
    <FormularioAcao acao={acaoRegistrarPosicao} className="space-y-3">
      <Campo rotulo="Veículo" obrigatorio>
        <select name="veiculoId" required defaultValue="">
          <option value="" disabled>
            Selecione…
          </option>
          {veiculos.map((veiculo) => (
            <option key={veiculo.id} value={veiculo.id}>
              {veiculo.placa}
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
                {pesos[campo.chave]} ({soma > 0
                  ? Math.round((pesos[campo.chave] / soma) * 100)
                  : 0}
                % do total)
              </span>
            </div>
            <input
              type="range"
              name={campo.chave}
              min={0}
              max={50}
              value={pesos[campo.chave]}
              onChange={(e) =>
                setPesos((atual) => ({
                  ...atual,
                  [campo.chave]: Number(e.target.value),
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

      <BotaoEnviar>Salvar parâmetros</BotaoEnviar>
    </FormularioAcao>
  );
}

export { Botao };
