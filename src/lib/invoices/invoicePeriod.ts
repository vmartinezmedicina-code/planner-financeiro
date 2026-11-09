/**
 * Cálculo puro (sem banco) do período de fatura de um cartão. Todas as datas
 * são UTC à meia-noite, como o resto do sistema.
 *
 * Regra (docs/DATA-MODEL-V2.md):
 * - Dia de fechamento C (inclusivo). Compra no dia d do mês M:
 *     d <= C  → fatura de referência M
 *     d >  C  → fatura de referência M+1
 *   C é limitado ao último dia do mês quando maior que ele.
 * - closingDate = dia C do mês de referência.
 * - openingDate = dia seguinte ao fechamento do mês anterior.
 * - dueDate = dia D do mês de referência se D > C; senão dia D do mês seguinte.
 * - Sem closingDay: fecha no último dia do mês da compra. Sem dueDay: vence dia 10.
 */

export type InvoiceCardConfig = { closingDay: number | null; dueDay: number | null };

export type InvoicePeriod = {
  referenceYear: number;
  referenceMonth: number; // 1-12
  openingDate: Date;
  closingDate: Date;
  dueDate: Date;
};

export const DEFAULT_DUE_DAY = 10;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month))));
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** Dia efetivo de fechamento em um mês (clamp ao último dia). */
export function closingDayFor(card: InvoiceCardConfig, year: number, month: number): number {
  const last = daysInMonth(year, month);
  if (!card.closingDay) return last;
  return Math.min(card.closingDay, last);
}

/** Mês de referência da fatura em que uma compra cai. */
export function referenceFor(card: InvoiceCardConfig, purchaseDate: Date): { year: number; month: number } {
  const y = purchaseDate.getUTCFullYear();
  const m = purchaseDate.getUTCMonth() + 1;
  const d = purchaseDate.getUTCDate();
  if (d <= closingDayFor(card, y, m)) return { year: y, month: m };
  return addMonths(y, m, 1);
}

/** Período completo da fatura de referência (ano, mês). */
export function periodForReference(card: InvoiceCardConfig, year: number, month: number): InvoicePeriod {
  const closing = closingDayFor(card, year, month);
  const closingDate = utcDate(year, month, closing);

  const prev = addMonths(year, month, -1);
  const prevClosing = closingDayFor(card, prev.year, prev.month);
  const openingDate = new Date(utcDate(prev.year, prev.month, prevClosing).getTime() + 86400000);

  const dueDay = card.dueDay ?? DEFAULT_DUE_DAY;
  const dueInSameMonth = card.closingDay != null && dueDay > closing;
  const dueRef = dueInSameMonth ? { year, month } : addMonths(year, month, 1);
  const dueDate = utcDate(dueRef.year, dueRef.month, dueDay);

  return { referenceYear: year, referenceMonth: month, openingDate, closingDate, dueDate };
}

/** Período da fatura em que uma compra cai. */
export function resolveInvoicePeriod(card: InvoiceCardConfig, purchaseDate: Date): InvoicePeriod {
  const ref = referenceFor(card, purchaseDate);
  return periodForReference(card, ref.year, ref.month);
}

export type InvoiceStatusValue = "OPEN" | "CLOSED" | "PAID" | "PARTIAL" | "OVERDUE";

/**
 * Status efetivo. PAID e PARTIAL são persistidos; os demais derivam das datas:
 * hoje <= fechamento → OPEN; fechada e não vencida → CLOSED; vencida sem pagar → OVERDUE.
 */
export function deriveInvoiceStatus(
  inv: { status: InvoiceStatusValue; closingDate: Date; dueDate: Date; totalCents: number; paidCents: number },
  today: Date
): InvoiceStatusValue {
  if (inv.status === "PAID") return "PAID";
  if (inv.paidCents > 0 && inv.paidCents < inv.totalCents) return "PARTIAL";
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (t <= inv.closingDate.getTime()) return "OPEN";
  if (t <= inv.dueDate.getTime()) return "CLOSED";
  return "OVERDUE";
}

export function invoiceLabel(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}
