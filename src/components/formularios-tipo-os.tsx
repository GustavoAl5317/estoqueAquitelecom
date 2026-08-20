"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { acaoAtualizarTipoOS, acaoCriarTipoOS } from "@/app/acoes/operacao";
import { Aviso, Botao, Campo, Etiqueta } from "./ui";
import { BotaoEnviar, FormularioAcao } from "./formulario";
import type { Tom } from "@/lib/dominio";

const TONS: { valor: Tom; rotulo: string }[] = [
  { valor: "neutro", rotulo: "Cinza" },
  { valor: "informativo", rotulo: "Azul" },
  { valor: "positivo", rotulo: "Verde" },
  { valor: "atencao", rotulo: "Amarelo" },
  { valor: "critico", rotulo: "Vermelho" },
  { valor: "roxo", rotulo: "Roxo" },
];

export type TipoEditavel = {
  id: string;
  valor: string;
  rotulo: string;
  tom: Tom;
  ativo: boolean;
};

/**
 * 2.5 — TIPOS DE ORDEM DE SERVIÇO.
 *
 * O código (`valor`) não aparece para edição de propósito: ele é o que está
 * gravado em toda OS já lançada, e trocá-lo quebraria o histórico. O que se
 * edita é como o tipo se chama e como ele aparece.
 *
 * Desativar tira o tipo da lista de OS nova, mas mantém o rótulo nas ordens
 * antigas — é o que permite parar de usar um tipo sem apagar o passado.
 */
export function ListaDeTiposOS({ tipos }: { tipos: TipoEditavel[] }) {
  return (
    <div className="space-y-2">
      {tipos.map((tipo) => (
        <LinhaDoTipo key={tipo.id} tipo={tipo} />
      ))}
    </div>
  );
}

function LinhaDoTipo({ tipo }: { tipo: TipoEditavel }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [rotulo, setRotulo] = useState(tipo.rotulo);
  const [tom, setTom] = useState<string>(tipo.tom);
  const [ativo, setAtivo] = useState(tipo.ativo);
  const [erro, setErro] = useState<string | null>(null);

  const mudou = rotulo !== tipo.rotulo || tom !== tipo.tom || ativo !== tipo.ativo;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("tipoId", tipo.id);
      dados.set("rotulo", rotulo);
      dados.set("tom", tom);
      if (ativo) dados.set("ativo", "1");

      const resultado = await acaoAtualizarTipoOS({}, dados);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-[var(--borda)] p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={rotulo}
          onChange={(e) => setRotulo(e.target.value)}
          className="min-w-[12rem] flex-1 !py-1 !text-sm"
          aria-label={`Nome do tipo ${tipo.valor}`}
        />
        <select
          value={tom}
          onChange={(e) => setTom(e.target.value)}
          className="!py-1 !text-sm"
          aria-label={`Cor do tipo ${tipo.valor}`}
        >
          {TONS.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
        <Etiqueta tom={tom as Tom}>{rotulo || tipo.valor}</Etiqueta>
        <label className="flex items-center gap-1.5 text-xs text-[var(--texto-2)]">
          <input
            type="checkbox"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          em uso
        </label>
        <Botao
          variante="secundario"
          onClick={salvar}
          disabled={!mudou || pendente}
          type="button"
        >
          <Check className="size-4" aria-hidden /> Salvar
        </Botao>
      </div>

      <p className="mt-1 font-mono text-[11px] text-[var(--texto-3)]">
        {tipo.valor}
      </p>

      {erro && (
        <div className="mt-2">
          <Aviso tom="critico">{erro}</Aviso>
        </div>
      )}
    </div>
  );
}

export function FormularioNovoTipoOS() {
  return (
    <FormularioAcao
      acao={acaoCriarTipoOS}
      className="flex flex-wrap items-end gap-2"
      aoConcluir={<Aviso tom="positivo">Tipo criado.</Aviso>}
    >
      <Campo rotulo="Novo tipo de OS" className="min-w-40 flex-1">
        <input name="rotulo" required placeholder="Ex.: Troca de poste" />
      </Campo>
      <Campo rotulo="Cor" className="min-w-32">
        <select name="tom" defaultValue="neutro">
          {TONS.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <BotaoEnviar variante="secundario">
        <Plus className="size-4" aria-hidden /> Criar
      </BotaoEnviar>
    </FormularioAcao>
  );
}
