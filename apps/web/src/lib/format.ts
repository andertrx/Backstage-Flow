// Formatação de números no padrão brasileiro. A moeda é sempre a da conta:
// nunca convertemos BRL ↔ USD.
import type { KpiFormat } from "@backstage/shared";

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function formatKpi(value: number, format: KpiFormat, currency: string): string {
  switch (format) {
    case "money":
      return formatMoney(value, currency);
    case "integer":
      return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
    case "decimal":
      return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
    case "percent":
      return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`;
    case "ratio":
      return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}x`;
  }
}

/** Variação com sinal: +20,0% / −5,3%. */
export function formatChange(percent: number): string {
  const abs = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(percent));
  return percent > 0 ? `+${abs}%` : percent < 0 ? `−${abs}%` : `${abs}%`;
}

/** 2026-09-23 → 23/09/2026 */
export function formatDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d}/${m}/${y}`;
}

/** "há 5 minutos", "há 3 horas", "há 2 dias" (texto curto para datas passadas). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "agora mesmo";
  if (minutes < 60) return `há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} ${days === 1 ? "dia" : "dias"}`;
}

/** Data e hora curtas no padrão brasileiro. */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
