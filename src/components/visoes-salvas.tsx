"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, BookmarkPlus, Users, X } from "lucide-react";
import { acaoApagarVisao, acaoSalvarVisao } from "@/app/acoes/visoes";
import { Aviso, Botao, Etiqueta } from "./ui";
import { cn } from "@/lib/utils";

export type VisaoDaTela = {
  id: string;
  nome: string;
  filtros: string;
  compartilhada: boolean;
  /** quem criou pode apagar; os outros só usam */
  minha: boolean;
  autor: string;
};

/**
 * 2.19 / 3.29 — VISÕES SALVAS.
 *
 * Remontar o mesmo filtro toda manhã é o atrito que faz o supervisor voltar
 * para a planilha. A visão guarda a query da tela, então continua valendo
 * quando a tela ganhar um filtro novo — e o nome dado por quem usa diz mais do
 * que qualquer rótulo que o sistema inventasse.
 *
 * Compartilhar deixa a visão visível para todo mundo; apagar continua sendo só
 * de quem criou, mesmo depois de compartilhada.
 */
export function VisoesSalvas({
  tela,
  filtrosAtuais,
  visoes,
}: {
  tela: string;
  filtrosAtuais: string;
  visoes: VisaoDaTela[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [abrindo, setAbrindo] = useState(false);
  const [nome, setNome] = useState("");
  const [compartilhada, setCompartilhada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const filtros = filtrosAtuais.replace(/^\?/, "");
  const aplicada = visoes.find((v) => v.filtros === filtros)?.id ?? null;

  function salvar() {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("tela", tela);
      dados.set("nome", nome);
      dados.set("filtros", filtros);
      if (compartilhada) dados.set("compartilhada", "1");

      const resultado = await acaoSalvarVisao({}, dados);
      if (resultado.erro) return setErro(resultado.erro);

      setNome("");
      setCompartilhada(false);
      setAbrindo(false);
      router.refresh();
    });
  }

  function apagar(id: string) {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("tela", tela);
      dados.set("visaoId", id);

      const resultado = await acaoApagarVisao({}, dados);
      if (resultado.erro) return setErro(resultado.erro);
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-2", pendente && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
          <Bookmark className="size-3.5" aria-hidden /> Visões
        </span>

        {visoes.length === 0 && (
          <span className="text-xs text-[var(--texto-3)]">
            nenhuma salva ainda
          </span>
        )}

        {visoes.map((visao) => (
          <span
            key={visao.id}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              aplicada === visao.id
                ? "border-[var(--acento)] bg-[var(--acento-suave)] text-[var(--acento)]"
                : "border-[var(--borda)] text-[var(--texto-2)]",
            )}
          >
            <Link
              href={`${tela}?${visao.filtros}`}
              title={
                visao.minha
                  ? visao.filtros
                  : `${visao.filtros} · compartilhada por ${visao.autor}`
              }
            >
              {visao.nome}
            </Link>
            {visao.compartilhada && (
              <Users className="size-3 opacity-60" aria-hidden />
            )}
            {visao.minha && (
              <button
                type="button"
                onClick={() => apagar(visao.id)}
                aria-label={`Apagar a visão ${visao.nome}`}
                className="opacity-50 hover:opacity-100"
              >
                <X className="size-3" aria-hidden />
              </button>
            )}
          </span>
        ))}

        {!abrindo && (
          <button
            type="button"
            onClick={() => setAbrindo(true)}
            disabled={!filtros}
            title={
              filtros
                ? "Guardar os filtros aplicados agora"
                : "Filtre a lista primeiro — não há o que salvar"
            }
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs text-[var(--texto-3)] hover:text-[var(--acento)] disabled:opacity-40"
          >
            <BookmarkPlus className="size-3.5" aria-hidden /> Salvar esta
          </button>
        )}
      </div>

      {abrindo && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            autoFocus
            value={nome}
            onChange={(evento) => setNome(evento.target.value)}
            onKeyDown={(evento) => evento.key === "Enter" && salvar()}
            placeholder="Nome da visão — ex.: críticas sem técnico"
            className="min-w-[16rem] flex-1 !py-1 !text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-[var(--texto-2)]">
            <input
              type="checkbox"
              checked={compartilhada}
              onChange={(evento) => setCompartilhada(evento.target.checked)}
            />
            compartilhar com a equipe
          </label>
          <Botao variante="primario" onClick={salvar} disabled={pendente}>
            Salvar
          </Botao>
          <Botao
            variante="sutil"
            onClick={() => {
              setAbrindo(false);
              setErro(null);
            }}
          >
            Cancelar
          </Botao>
          <Etiqueta tom="neutro">{filtros || "sem filtro"}</Etiqueta>
        </div>
      )}

      {erro && <Aviso tom="critico">{erro}</Aviso>}
    </div>
  );
}
