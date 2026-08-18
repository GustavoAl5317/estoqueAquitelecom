"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, MapPin, User } from "lucide-react";
import {
  PRIORIDADE_OS,
  SITUACAO_SLA,
  STATUS_OS,
  TIPO_OS,
  type Tom,
} from "@/lib/dominio";
import { acaoAtribuirOrdem, acaoMoverOrdem } from "@/app/acoes/operacao";
import { Aviso, Etiqueta } from "./ui";
import { cn } from "@/lib/utils";

export type CartaoOS = {
  id: string;
  numero: string;
  cliente: string | null;
  endereco: string | null;
  bairro: string | null;
  tipo: string;
  prioridade: string;
  status: string;
  tecnicoId: string | null;
  tecnicoNome: string | null;
  situacao: string;
  prazoTexto: string;
  materiais: number;
};

export type ColunaOS = {
  status: string;
  rotulo: string;
  total: number;
  /** cartões antigos que a coluna não exibe, mas continuam contados */
  ocultas: number;
  emRisco: number;
  cartoes: CartaoOS[];
};

/**
 * 2.20 — QUADRO DE ORDENS DE SERVIÇO.
 *
 * Arrastar um cartão para outra coluna é a operação inteira: o status muda no
 * servidor e a auditoria registra quem moveu. Como nem todo mundo consegue
 * arrastar — dedo grande, tela pequena, mouse ruim — cada cartão também tem um
 * seletor de coluna. As duas formas chamam a mesma ação.
 */
export function QuadroOS({
  colunas,
  tecnicos,
}: {
  colunas: ColunaOS[];
  tecnicos: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function mover(ordemId: string, status: string) {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("ordemId", ordemId);
      dados.set("status", status);
      const resultado = await acaoMoverOrdem({}, dados);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  function atribuir(ordemId: string, tecnicoId: string) {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      dados.set("ordemId", ordemId);
      dados.set("tecnicoId", tecnicoId);
      const resultado = await acaoAtribuirOrdem({}, dados);
      if (resultado.erro) setErro(resultado.erro);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {erro && (
        <Aviso tom="critico" titulo="Não foi possível mover">
          {erro}
        </Aviso>
      )}

      <div
        className={cn(
          "grid grid-flow-col auto-cols-[minmax(250px,1fr)] gap-3 overflow-x-auto pb-3",
          pendente && "opacity-60",
        )}
      >
        {colunas.map((coluna) => (
          <section
            key={coluna.status}
            onDragOver={(evento) => {
              evento.preventDefault();
              setSobre(coluna.status);
            }}
            onDragLeave={() => setSobre((s) => (s === coluna.status ? null : s))}
            onDrop={(evento) => {
              evento.preventDefault();
              setSobre(null);
              if (arrastando) mover(arrastando, coluna.status);
              setArrastando(null);
            }}
            className={cn(
              "flex min-h-[120px] flex-col rounded-[var(--raio)] border bg-[var(--superficie-2)] transition-colors",
              sobre === coluna.status
                ? "border-[var(--acento)] bg-[var(--acento-suave)]"
                : "border-[var(--borda)]",
            )}
          >
            <header className="flex items-center justify-between gap-2 border-b border-[var(--borda)] px-3 py-2">
              <span className="text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-2)]">
                {coluna.rotulo}
              </span>
              <span className="flex items-center gap-1.5">
                {coluna.emRisco > 0 && (
                  <Etiqueta tom="critico">{coluna.emRisco} em risco</Etiqueta>
                )}
                <span className="tabular text-xs text-[var(--texto-3)]">
                  {coluna.total}
                </span>
              </span>
            </header>

            <div className="flex-1 space-y-2 p-2">
              {coluna.cartoes.length === 0 && (
                <p className="px-1 py-6 text-center text-xs text-[var(--texto-3)]">
                  {coluna.ocultas > 0
                    ? `${coluna.ocultas} concluída(s) fora da janela de 24 h`
                    : "Arraste uma OS para cá"}
                </p>
              )}

              {coluna.cartoes.map((cartao) => (
                <article
                  key={cartao.id}
                  draggable
                  onDragStart={() => setArrastando(cartao.id)}
                  onDragEnd={() => setArrastando(null)}
                  className={cn(
                    "cursor-grab rounded-lg border border-[var(--borda)] bg-[var(--superficie)] p-2.5 shadow-[var(--sombra)] active:cursor-grabbing",
                    arrastando === cartao.id && "opacity-40",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/os/${cartao.id}`}
                      className="font-mono text-xs font-semibold hover:text-[var(--acento)]"
                    >
                      {cartao.numero}
                    </Link>
                    <Etiqueta tom={PRIORIDADE_OS.tom(cartao.prioridade)}>
                      {cartao.prioridade}
                    </Etiqueta>
                  </div>

                  <p className="mt-1 truncate text-sm font-medium">
                    {cartao.cliente ?? "Cliente não informado"}
                  </p>
                  <p className="text-xs text-[var(--texto-3)]">
                    {TIPO_OS.rotulo(cartao.tipo)}
                  </p>

                  {(cartao.bairro || cartao.endereco) && (
                    <p className="mt-1.5 flex items-start gap-1 text-xs text-[var(--texto-3)]">
                      <MapPin className="mt-px size-3 shrink-0" aria-hidden />
                      <span className="truncate">
                        {cartao.bairro ?? cartao.endereco}
                      </span>
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Etiqueta tom={SITUACAO_SLA.tom(cartao.situacao) as Tom}>
                      <Clock className="size-3" aria-hidden />
                      {cartao.prazoTexto}
                    </Etiqueta>
                    {cartao.materiais > 0 && (
                      <Etiqueta tom="neutro">{cartao.materiais} mov.</Etiqueta>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--borda)] pt-2">
                    <User className="size-3 shrink-0 text-[var(--texto-3)]" aria-hidden />
                    <select
                      value={cartao.tecnicoId ?? ""}
                      onChange={(evento) => atribuir(cartao.id, evento.target.value)}
                      className="min-w-0 flex-1 !py-1 !text-xs"
                      aria-label={`Responsável pela OS ${cartao.numero}`}
                    >
                      <option value="">sem responsável</option>
                      {tecnicos.map((tecnico) => (
                        <option key={tecnico.id} value={tecnico.id}>
                          {tecnico.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* alternativa ao arrastar, para toque e teclado */}
                  <select
                    value={cartao.status}
                    onChange={(evento) => mover(cartao.id, evento.target.value)}
                    className="mt-1.5 w-full !py-1 !text-xs"
                    aria-label={`Situação da OS ${cartao.numero}`}
                  >
                    {STATUS_OS.opcoes.map((opcao) => (
                      <option key={opcao.valor} value={opcao.valor}>
                        {opcao.rotulo}
                      </option>
                    ))}
                  </select>

                  {!cartao.tecnicoId && cartao.status !== "ABERTA" && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--atencao)]">
                      <AlertTriangle className="size-3" aria-hidden />
                      sem responsável
                    </p>
                  )}
                </article>
              ))}

              {coluna.ocultas > 0 && coluna.cartoes.length > 0 && (
                <p className="px-1 pt-1 text-center text-[11px] text-[var(--texto-3)]">
                  +{coluna.ocultas} concluída(s) há mais de 24 h
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
