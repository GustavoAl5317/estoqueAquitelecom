import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tom } from "@/lib/dominio";

// ---------------------------------------------------------------------------
// Superfícies
// ---------------------------------------------------------------------------

export function Cartao({
  titulo,
  descricao,
  acoes,
  children,
  className,
  semPadding,
}: {
  titulo?: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children?: ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] shadow-[var(--sombra)]",
        className,
      )}
    >
      {(titulo || acoes) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--borda)] px-4 py-3">
          <div className="min-w-0">
            {titulo && (
              <h2 className="text-[13px] font-semibold tracking-wide uppercase text-[var(--texto-2)]">
                {titulo}
              </h2>
            )}
            {descricao && (
              <p className="mt-0.5 text-sm text-[var(--texto-3)]">{descricao}</p>
            )}
          </div>
          {acoes && <div className="flex shrink-0 items-center gap-2">{acoes}</div>}
        </header>
      )}
      <div className={semPadding ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && (
          <p className="mt-1 max-w-2xl text-sm text-[var(--texto-2)]">{descricao}</p>
        )}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

const TONS: Record<Tom, { fundo: string; texto: string }> = {
  neutro: { fundo: "var(--neutro-suave)", texto: "var(--neutro)" },
  positivo: { fundo: "var(--positivo-suave)", texto: "var(--positivo)" },
  informativo: { fundo: "var(--informativo-suave)", texto: "var(--informativo)" },
  atencao: { fundo: "var(--atencao-suave)", texto: "var(--atencao)" },
  critico: { fundo: "var(--critico-suave)", texto: "var(--critico)" },
  roxo: { fundo: "var(--roxo-suave)", texto: "var(--roxo)" },
};

export function Etiqueta({
  children,
  tom = "neutro",
  ponto,
  className,
}: {
  children: ReactNode;
  tom?: Tom;
  ponto?: boolean;
  className?: string;
}) {
  const cores = TONS[tom];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        className,
      )}
      style={{ background: cores.fundo, color: cores.texto }}
    >
      {ponto && (
        <span
          className="size-1.5 rounded-full"
          style={{ background: cores.texto }}
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}

export function Metrica({
  rotulo,
  valor,
  detalhe,
  tom = "neutro",
  href,
  icone,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  tom?: Tom;
  href?: string;
  icone?: ReactNode;
}) {
  const cores = TONS[tom];
  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
          {rotulo}
        </span>
        {icone && (
          <span
            className="grid size-7 place-items-center rounded-lg"
            style={{ background: cores.fundo, color: cores.texto }}
          >
            {icone}
          </span>
        )}
      </div>
      <div
        className="tabular mt-2 text-[26px] leading-none font-semibold"
        style={{ color: tom === "neutro" ? "var(--texto)" : cores.texto }}
      >
        {valor}
      </div>
      {detalhe && (
        <div className="mt-1.5 text-xs text-[var(--texto-3)]">{detalhe}</div>
      )}
    </>
  );

  const classe =
    "block rounded-[var(--raio)] border border-[var(--borda)] bg-[var(--superficie)] p-3.5 shadow-[var(--sombra)] transition-colors";

  return href ? (
    <Link href={href} className={cn(classe, "hover:border-[var(--borda-forte)]")}>
      {conteudo}
    </Link>
  ) : (
    <div className={classe}>{conteudo}</div>
  );
}

export function BarraNivel({
  percentual,
  tom = "informativo",
}: {
  percentual: number;
  tom?: Tom;
}) {
  const largura = Math.max(2, Math.min(100, percentual));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--superficie-3)]"
      role="presentation"
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${largura}%`, background: TONS[tom].texto }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------------

type Variante = "primario" | "secundario" | "sutil" | "perigo";

const VARIANTES: Record<Variante, string> = {
  primario:
    "bg-[var(--acento)] text-white hover:opacity-90 border border-transparent",
  secundario:
    "bg-[var(--superficie)] text-[var(--texto)] border border-[var(--borda-forte)] hover:bg-[var(--superficie-3)]",
  sutil:
    "bg-transparent text-[var(--texto-2)] border border-transparent hover:bg-[var(--superficie-3)] hover:text-[var(--texto)]",
  perigo:
    "bg-[var(--critico-suave)] text-[var(--critico)] border border-transparent hover:brightness-95",
};

const BASE_BOTAO =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50";

export function Botao({
  variante = "secundario",
  className,
  ...props
}: ComponentProps<"button"> & { variante?: Variante }) {
  return (
    <button
      {...props}
      className={cn(BASE_BOTAO, VARIANTES[variante], className)}
    />
  );
}

export function BotaoLink({
  variante = "secundario",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link {...props} className={cn(BASE_BOTAO, VARIANTES[variante], className)} />;
}

// ---------------------------------------------------------------------------
// Tabelas
// ---------------------------------------------------------------------------

export function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  numerico,
}: {
  children?: ReactNode;
  className?: string;
  numerico?: boolean;
}) {
  return (
    <th
      className={cn(
        "border-b border-[var(--borda)] bg-[var(--superficie-2)] px-3 py-2 text-left text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)] first:pl-4 last:pr-4",
        numerico && "text-right",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  numerico,
}: {
  children?: ReactNode;
  className?: string;
  numerico?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-[var(--borda)] px-3 py-2.5 align-middle first:pl-4 last:pr-4",
        numerico && "tabular text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Linha({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("transition-colors hover:bg-[var(--superficie-2)]", className)}>
      {children}
    </tr>
  );
}

export function Vazio({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="font-medium">{titulo}</p>
      {descricao && (
        <p className="max-w-md text-sm text-[var(--texto-3)]">{descricao}</p>
      )}
      {acao && <div className="mt-2">{acao}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formulários
// ---------------------------------------------------------------------------

export function Campo({
  rotulo,
  children,
  dica,
  obrigatorio,
  className,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: ReactNode;
  obrigatorio?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-xs font-semibold text-[var(--texto-2)]">
        {rotulo}
        {obrigatorio && <span className="text-[var(--critico)]"> *</span>}
      </span>
      {children}
      {dica && <span className="mt-1 block text-xs text-[var(--texto-3)]">{dica}</span>}
    </label>
  );
}

export function Aviso({
  tom = "atencao",
  titulo,
  children,
}: {
  tom?: Tom;
  titulo?: ReactNode;
  children?: ReactNode;
}) {
  const cores = TONS[tom];
  return (
    <div
      className="rounded-lg border-l-2 px-3 py-2.5 text-sm"
      style={{
        background: cores.fundo,
        borderColor: cores.texto,
        color: "var(--texto)",
      }}
    >
      {titulo && (
        <p className="font-semibold" style={{ color: cores.texto }}>
          {titulo}
        </p>
      )}
      {children && <div className="text-[var(--texto-2)]">{children}</div>}
    </div>
  );
}

export function Secao({
  titulo,
  children,
  acoes,
}: {
  titulo: string;
  children: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold tracking-wide uppercase text-[var(--texto-2)]">
          {titulo}
        </h3>
        {acoes}
      </div>
      {children}
    </div>
  );
}

export function ListaDefinicoes({
  itens,
  colunas = 2,
}: {
  itens: { rotulo: string; valor: ReactNode }[];
  colunas?: 1 | 2 | 3 | 4;
}) {
  const grade = {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-2 lg:grid-cols-4",
  }[colunas];

  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", grade)}>
      {itens.map((item) => (
        <div key={item.rotulo}>
          <dt className="text-[11px] font-semibold tracking-wide uppercase text-[var(--texto-3)]">
            {item.rotulo}
          </dt>
          <dd className="mt-0.5 text-sm">{item.valor ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
