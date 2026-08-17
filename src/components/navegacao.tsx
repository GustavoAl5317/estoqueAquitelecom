"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  History,
  LayoutDashboard,
  Menu,
  PackagePlus,
  Radio,
  Recycle,
  ScanLine,
  Settings,
  ShieldCheck,
  Warehouse,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const GRUPOS = [
  {
    titulo: "Operação",
    itens: [
      { href: "/", rotulo: "Dashboard", icone: LayoutDashboard },
      { href: "/central", rotulo: "Central de Controle", icone: Radio },
      { href: "/alertas", rotulo: "Alertas", icone: AlertTriangle },
      { href: "/analise", rotulo: "Análise e previsão", icone: BrainCircuit },
    ],
  },
  {
    titulo: "Estoque",
    itens: [
      { href: "/materiais", rotulo: "Materiais", icone: Boxes },
      { href: "/seriais", rotulo: "Equipamentos", icone: ScanLine },
      { href: "/locais", rotulo: "Locais e detentores", icone: Warehouse },
    ],
  },
  {
    titulo: "Movimentação",
    itens: [
      { href: "/entradas", rotulo: "Entradas", icone: PackagePlus },
      { href: "/movimentacoes", rotulo: "Saídas e transferências", icone: ArrowLeftRight },
      { href: "/ordens", rotulo: "Material por OS", icone: ClipboardCheck },
      { href: "/triagem", rotulo: "Logística reversa", icone: Recycle },
      { href: "/reservas", rotulo: "Reservas", icone: ShieldCheck },
      { href: "/inventario", rotulo: "Inventário", icone: ClipboardList },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { href: "/relatorios", rotulo: "Relatórios", icone: FileBarChart },
      { href: "/auditoria", rotulo: "Auditoria", icone: History },
      { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
    ],
  },
];

function estaAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Itens({ aoNavegar }: { aoNavegar?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-5 px-3 py-4">
      {GRUPOS.map((grupo) => (
        <div key={grupo.titulo}>
          <p className="px-2 pb-1.5 text-[10px] font-semibold tracking-[0.08em] uppercase text-[var(--texto-3)]">
            {grupo.titulo}
          </p>
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativo = estaAtivo(pathname, item.href);
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

export function NavegacaoLateral() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-[var(--borda)] bg-[var(--superficie)] lg:block">
      <div className="sticky top-0 max-h-screen overflow-y-auto">
        <Marca />
        <Itens />
      </div>
    </aside>
  );
}

export function NavegacaoMovel() {
  const [aberto, setAberto] = useState(false);

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

      {aberto && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setAberto(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-64 overflow-y-auto bg-[var(--superficie)] shadow-[var(--sombra-alta)]">
            <div className="flex items-center justify-between border-b border-[var(--borda)] pr-2">
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
            <Itens aoNavegar={() => setAberto(false)} />
          </div>
        </div>
      )}
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
