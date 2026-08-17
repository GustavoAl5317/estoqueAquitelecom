import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { ABREVIACAO_UNIDADE } from "./dominio";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const formatadorMoeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function moeda(valor: number | null | undefined) {
  return formatadorMoeda.format(valor ?? 0);
}

/** moeda compacta para cartões de indicador: R$ 184,2 mil */
export function moedaCompacta(valor: number) {
  if (Math.abs(valor) >= 1_000_000) {
    return `R$ ${(valor / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (Math.abs(valor) >= 1_000) {
    return `R$ ${(valor / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return moeda(valor);
}

export function numero(valor: number | null | undefined, casas = 0) {
  return (valor ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: casas,
  });
}

/** 240 + "M" -> "240 m" ; 3 + "UN" -> "3 un" */
export function quantidade(valor: number, unidade: string) {
  const casas = Number.isInteger(valor) ? 0 : 2;
  return `${numero(valor, casas)} ${ABREVIACAO_UNIDADE[unidade] ?? unidade.toLowerCase()}`;
}

export function percentual(valor: number, casas = 0) {
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: casas })}%`;
}

export function dataHora(valor: Date | string | null | undefined) {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function data(valor: Date | string | null | undefined) {
  if (!valor) return "—";
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return d.toLocaleDateString("pt-BR");
}

export function hora(valor: Date | string) {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const DIA = 86_400_000;

export function diasDesde(valor: Date | string) {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  return Math.floor((Date.now() - d.getTime()) / DIA);
}

export function tempoRelativo(valor: Date | string) {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  const segundos = Math.floor((Date.now() - d.getTime()) / 1000);
  if (segundos < 60) return "agora há pouco";
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  return `há ${Math.floor(meses / 12)} ano(s)`;
}

/** remove acentos e caixa para buscas locais (1.28) */
export function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function slugificar(texto: string) {
  return normalizar(texto)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function iniciais(nome: string) {
  return nome
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function inicioDoDia(d = new Date()) {
  const copia = new Date(d);
  copia.setHours(0, 0, 0, 0);
  return copia;
}

export function diasAtras(dias: number) {
  return new Date(Date.now() - dias * DIA);
}
