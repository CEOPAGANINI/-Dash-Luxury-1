/**
 * Formatadores compartilhados. No banco, valores monetários permanecem em
 * centavos; na dashboard executiva, os formatadores de `shared/formatters`
 * recebem unidades monetárias já normalizadas.
 */

export {
  formatCompactCurrency,
  formatCurrency,
  formatDurationSeconds,
  formatInteger,
  formatPercent,
  formatRatio,
  formatStatus,
} from "@/shared/formatters/dashboard";

export function formatMoney(
  cents: number | bigint,
  currency: string = "BRL",
  locale: string = "pt-BR",
): string {
  const value = Number(cents) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    value,
  );
}

export function formatNumber(value: number, locale: string = "pt-BR"): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(d);
}

export function formatDateTime(
  date: Date | string,
  locale: string = "pt-BR",
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}
