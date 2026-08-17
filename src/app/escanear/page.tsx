import { ScanLine } from "lucide-react";
import { CabecalhoPagina, Cartao, Aviso } from "@/components/ui";
import { LeitorDeCodigo } from "@/components/leitor-codigo";

/** 1.27 / 1.28 — bancada de leitura: o operador escaneia e a ficha abre. */
export default async function Escanear({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; erro?: string }>;
}) {
  const { q, erro } = await searchParams;

  return (
    <div className="mx-auto max-w-xl">
      <CabecalhoPagina
        titulo="Escanear"
        descricao="Aponte o leitor para a etiqueta ou digite o identificador. Aceita serial, MAC, patrimônio, código de barras e código interno."
      />

      {erro && q && (
        <div className="mb-4">
          <Aviso tom="critico" titulo="Identificador não encontrado">
            Nada cadastrado com <strong>{q}</strong>. Confira a etiqueta ou
            pesquise pelo material.
          </Aviso>
        </div>
      )}

      <Cartao>
        <LeitorDeCodigo valorInicial={q} />
        <p className="mt-4 flex items-start gap-2 text-xs text-[var(--texto-3)]">
          <ScanLine className="mt-0.5 size-4 shrink-0" />
          Leitores de código de barras funcionam como teclado: eles digitam o
          código e enviam automaticamente. Deixe esta tela aberta com o campo em
          foco durante a conferência.
        </p>
      </Cartao>
    </div>
  );
}
