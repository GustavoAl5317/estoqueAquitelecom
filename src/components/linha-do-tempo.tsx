import Link from "next/link";
import { TIPO_MOVIMENTO } from "@/lib/dominio";
import { dataHora, numero } from "@/lib/utils";
import { Etiqueta } from "./ui";

export type EventoTimeline = {
  id: string;
  tipo: string;
  quantidade: number;
  criadoEm: Date;
  observacao?: string | null;
  origem?: { id: string; nome: string } | null;
  destino?: { id: string; nome: string } | null;
  usuario?: { nome: string } | null;
  unidade?: { serial: string } | null;
  entrada?: { numero: string } | null;
  movimentacao?: { numero: string; tipo: string; motivo?: string | null } | null;
};

/**
 * 1.23 — HISTÓRICO COMPLETO.
 * A timeline é a identidade operacional do item: nada some, tudo tem autor,
 * origem, destino e horário.
 */
export function LinhaDoTempo({
  eventos,
  mostrarSerial,
}: {
  eventos: EventoTimeline[];
  mostrarSerial?: boolean;
}) {
  if (!eventos.length) {
    return (
      <p className="px-4 py-8 text-center text-sm text-[var(--texto-3)]">
        Nenhuma movimentação registrada até agora.
      </p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {eventos.map((evento, i) => (
        <li key={evento.id} className="relative flex gap-3 pl-1">
          <div className="flex flex-col items-center">
            <span
              className="mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-[var(--superficie)]"
              style={{ background: corDoTipo(evento.tipo) }}
              aria-hidden
            />
            {i < eventos.length - 1 && (
              <span className="w-px flex-1 bg-[var(--borda)]" aria-hidden />
            )}
          </div>

          <div className="min-w-0 flex-1 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Etiqueta tom={TIPO_MOVIMENTO.tom(evento.tipo)}>
                {TIPO_MOVIMENTO.rotulo(evento.tipo)}
              </Etiqueta>
              <span className="tabular text-sm font-medium">
                {numero(evento.quantidade, 2)}
              </span>
              {mostrarSerial && evento.unidade && (
                <span className="font-mono text-xs text-[var(--texto-2)]">
                  {evento.unidade.serial}
                </span>
              )}
              <span className="ml-auto text-xs text-[var(--texto-3)]">
                {dataHora(evento.criadoEm)}
              </span>
            </div>

            <p className="mt-1 text-sm text-[var(--texto-2)]">
              {evento.origem ? (
                <Link
                  href={`/locais/${evento.origem.id}`}
                  className="hover:text-[var(--acento)]"
                >
                  {evento.origem.nome}
                </Link>
              ) : (
                <span className="text-[var(--texto-3)]">externo</span>
              )}
              <span className="mx-1.5 text-[var(--texto-3)]">→</span>
              {evento.destino ? (
                <Link
                  href={`/locais/${evento.destino.id}`}
                  className="hover:text-[var(--acento)]"
                >
                  {evento.destino.nome}
                </Link>
              ) : (
                <span className="text-[var(--texto-3)]">
                  {evento.tipo === "INSTALACAO" ? "cliente" : "fora do estoque"}
                </span>
              )}
            </p>

            <p className="mt-0.5 text-xs text-[var(--texto-3)]">
              {evento.usuario?.nome && `por ${evento.usuario.nome}`}
              {evento.entrada && ` · entrada ${evento.entrada.numero}`}
              {evento.movimentacao && ` · doc. ${evento.movimentacao.numero}`}
              {evento.movimentacao?.motivo && ` · ${evento.movimentacao.motivo}`}
              {!evento.movimentacao?.motivo && evento.observacao
                ? ` · ${evento.observacao}`
                : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function corDoTipo(tipo: string) {
  switch (tipo) {
    case "ENTRADA":
      return "var(--positivo)";
    case "SAIDA":
    case "INSTALACAO":
      return "var(--acento)";
    case "DEVOLUCAO":
    case "TRIAGEM":
    case "RETIRADA_CLIENTE":
      return "var(--roxo)";
    case "BAIXA":
      return "var(--critico)";
    case "AJUSTE":
      return "var(--atencao)";
    default:
      return "var(--neutro)";
  }
}
