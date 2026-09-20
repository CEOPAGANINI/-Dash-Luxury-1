export type DashboardNumberStatus =
  "confirmed" | "provisional" | "estimated" | "unavailable";

const currency0 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

const currency2 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const integer = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatCurrency(
  value: number,
  fractionDigits: 0 | 2 = 0,
): string {
  return (fractionDigits === 2 ? currency2 : currency0).format(value);
}

export function formatCompactCurrency(
  value: number,
  compactFrom = 10_000,
): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  if (abs >= 1_000_000) {
    return `${sign}R$ ${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  if (abs >= compactFrom) {
    return `${sign}R$ ${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  }
  return `${sign}${currency0.format(abs)}`;
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  return `${(value * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatRatio(value: number, digits = 2): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}x`;
}

export function formatDurationSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (hours > 0)
    return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  if (minutes > 0)
    return `${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function formatStatus(status: DashboardNumberStatus): string {
  if (status === "confirmed") return "Confirmado";
  if (status === "provisional") return "Provisório";
  if (status === "estimated") return "Estimado";
  return "Indisponível";
}
