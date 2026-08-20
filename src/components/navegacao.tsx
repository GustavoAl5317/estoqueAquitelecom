"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  Columns3,
  FileBarChart,
  Gauge,
  Hammer,
  History,
  LayoutDashboard,
  Map,
  MapPinned,
  Menu,
  PackagePlus,
  PackageSearch,
  Radio,
  Recycle,
  Route,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  Warehouse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Capacidade } from "@/lib/permissoes";

type ItemNav = {
  href: string;
  rotulo: string;
  icone: typeof LayoutDashboard;
  exige: Capacidade;
  exato?: boolean;
  /**
   * 3.63 — sobrevive ao enxugamento da tela do técnico.
   *
   * O técnico enxerga o estoque e as OS, e por isso herdava treze itens de
   * menu — dashboard, análise, relatórios, inventário. Na rua, num telefone,
   * isso é ruído entre ele e o próximo atendimento. Quem tem `os.executar` e
   * mais nada de supervisão vê só o que usa; a permissão continua a mesma, e
   * a URL direta continua abrindo.
   */
  campo?: boolean;
};

const GRUPOS: { titulo: string; itens: ItemNav[] }[] = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Dashboard", icone: LayoutDashboard, exige: "estoque.ver" },
      { href: "/central", rotulo: "Central de Controle", icone: Radio, exige: "operacao.supervisionar" },
      { href: "/fila", rotulo: "Fila inteligente", icone: Sparkles, exige: "os.gerenciar" },
      { href: "/decisao", rotulo: "Central de decisão", icone: Gauge, exige: "os.gerenciar" },
      { href: "/alertas", rotulo: "Alertas", icone: AlertTriangle, exige: "estoque.ver" },
      { href: "/analise", rotulo: "Análise e previsão", icone: BrainCircuit, exige: "estoque.ver" },
    ],
  },
  {
    titulo: "Campo",
    itens: [
      { href: "/campo", rotulo: "Meu dia", icone: Hammer, exige: "os.executar", campo: true },
      { href: "/os", rotulo: "Ordens de serviço", icone: ClipboardList, exato: true, exige: "os.ver", campo: true },
      { href: "/os/quadro", rotulo: "Quadro operacional", icone: Columns3, exige: "os.ver" },
      { href: "/os/mapa", rotulo: "Mapa e incidentes", icone: MapPinned, exige: "os.ver", campo: true },
      { href: "/roteiro", rotulo: "Roteiro do dia", icone: Route, exige: "os.ver", campo: true },
      { href: "/regioes", rotulo: "Regiões e bairros", icone: Map, exige: "operacao.supervisionar" },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { href: "/materiais", rotulo: "Materiais", icone: Boxes, exige: "estoque.ver", campo: true },
      { href: "/seriais", rotulo: "Equipamentos", icone: ScanLine, exige: "estoque.ver", campo: true },
      { href: "/locais", rotulo: "Locais e detentores", icone: Warehouse, exige: "estoque.ver" },
    ],
  },
  {
    titulo: "Movimentação",
    itens: [
      { href: "/entradas", rotulo: "Entradas", icone: PackagePlus, exige: "estoque.movimentar" },
      { href: "/movimentacoes", rotulo: "Saídas e transferências", icone: ArrowLeftRight, exige: "estoque.movimentar" },
      { href: "/ordens", rotulo: "Material por OS", icone: PackageSearch, exige: "estoque.ver" },
      { href: "/triagem", rotulo: "Logística reversa", icone: Recycle, exige: "estoque.movimentar" },
      { href: "/reservas", rotulo: "Reservas", icone: ShieldCheck, exige: "estoque.movimentar" },
      { href: "/inventario", rotulo: "Inventário", icone: ClipboardCheck, exige: "estoque.administrar" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/relatorios", rotulo: "Relatórios", icone: FileBarChart, exige: "estoque.ver" },
      { href: "/auditoria", rotulo: "Auditoria", icone: History, exige: "sistema.administrar" },
      { href: "/configuracoes", rotulo: "Configurações", icone: Settings, exige: "sistema.administrar" },
      { href: "/usuarios", rotulo: "Usuários e acesso", icone: Users, exige: "sistema.administrar" },
    ],
  },
];

/**
 * `exato` existe para "/os": sem ele, o item da lista ficaria aceso junto com
 * "/os/quadro", e dois itens acesos ao mesmo tempo dizem ao usuário que ele
 * está em dois lugares.
 */
function estaAtivo(pathname: string, item: { href: string; exato?: boolean }) {
  if (item.href === "/" || item.exato) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Itens({
  capacidades,
  aoNavegar,
}: {
  capacidades: Capacidade[];
  aoNavegar?: () => void;
}) {
  const pathname = usePathname();

  // quem executa OS mas não supervisiona é técnico: menu curto, o da rua
  const soDeCampo =
    capacidades.includes("os.executar") &&
    !capacidades.includes("os.gerenciar") &&
    !capacidades.includes("operacao.supervisionar") &&
    !capacidades.includes("sistema.administrar");

  // 3.67 — o menu mostra só o que o perfil alcança; grupo que esvazia some
  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter(
      (item) =>
        capacidades.includes(item.exige) && (!soDeCampo || item.campo),
    ),
  })).filter((grupo) => grupo.itens.length > 0);

  return (
    <nav className="space-y-5 px-3 py-4">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[var(--texto-3)]">
            {grupo.titulo}
          </p>
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativo = estaAtivo(pathname, item);
              const Icone = item.icone;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={aoNavegar}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors",
                      ativo
                        ? "bg-[var(--acento-suave)] font-medium text-[var(--acento-texto)]"
                        : "text-[var(--texto-2)] hover:bg-[var(--superficie-3)] hover:text-[var(--texto)]",
                    )}
                  >
                    <Icone className="size-4 shrink-0" aria-hidden />
                    {item.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function NavegacaoLateral({ capacidades }: { capacidades: Capacidade[] }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--borda)] bg-[var(--superficie)] lg:block">
      <div className="sticky top-0 max-h-screen overflow-y-auto">
        <Marca />
        <Itens capacidades={capacidades} />
      </div>
    </aside>
  );
}

/**
 * O painel sai por um portal, e não de onde o botão está.
 *
 * O cabeçalho usa `backdrop-blur`, e `backdrop-filter` cria bloco de contenção
 * para descendentes `fixed` — do mesmo jeito que `transform`. O menu, que pede
 * a tela inteira, ficava preso à altura do cabeçalho: uma faixa de uns cinquenta
 * pixels sobre o conteúdo, sem rolagem possível. Ancorar no `body` devolve o
 * `fixed` à viewport.
 */
export function NavegacaoMovel({ capacidades }: { capacidades: Capacidade[] }) {
  const [aberto, setAberto] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  // com o menu aberto, quem rola é o menu — não a página atrás dele
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  const painel = (
    <div className="fixed inset-0 z-50 lg:hidden">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => setAberto(false)}
        aria-hidden
      />
      <div className="absolute inset-y-0 left-0 flex w-64 max-w-[85vw] flex-col bg-[var(--superficie)] shadow-[var(--sombra-alta)]">
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--borda)] pr-2">
          <Marca />
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="grid size-8 place-items-center rounded-lg"
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Itens capacidades={capacidades} aoNavegar={() => setAberto(false)} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="grid size-9 place-items-center rounded-lg border border-[var(--borda-forte)] lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu className="size-4" />
      </button>

      {aberto && montado && createPortal(painel, document.body)}
    </>
  );
}

function Marca() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 border-b border-[var(--borda)] px-4 py-3.5"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-[var(--acento)] text-white">
        <Boxes className="size-4.5" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">Estoque</span>
        <span className="block text-[10px] tracking-wide uppercase text-[var(--texto-3)]">
          Plataforma operacional
        </span>
      </span>
    </Link>
  );
}
