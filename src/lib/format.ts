export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Formato curto para eixos de gráficos: R$ 1,5 mil, R$ 2 mi.
export function formatCompact(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function toDateInputValue(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().slice(0, 10);
}

const APP_TIME_ZONE = "America/Sao_Paulo";

/** Data de hoje (YYYY-MM-DD) no fuso do app, para valor padrao de campos de data. */
export function todayInputValue(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Hoje no fuso do app, como Date a meia-noite UTC (mesma convencao das datas gravadas). */
export function todayAsUtcDate(now: Date = new Date()): Date {
  return new Date(todayInputValue(now) + "T00:00:00.000Z");
}
