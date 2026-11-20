/**
 * Datas de uma recorrência mensal — funções puras, sem banco.
 *
 * Meses são tratados por índice (ano*12 + mês-1). O dia da série é limitado
 * ao último dia de cada mês (dia 31 vira 30/abr, 28 ou 29/fev).
 */

export const RECURRENCE_HORIZON_MONTHS = 12;

export function monthIndex(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

export function dateForMonth(idx: number, dayOfMonth: number): Date {
  const year = Math.floor(idx / 12);
  const month = idx % 12; // 0-11
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(Math.max(1, dayOfMonth), last)));
}

/** Último mês que deve existir: o mês atual + 11 (12 meses contando o atual). */
export function horizonIndex(today: Date): number {
  return monthIndex(today) + RECURRENCE_HORIZON_MONTHS - 1;
}

/**
 * Ocorrências que faltam gerar: do mês seguinte ao último gerado (ou do mês
 * de início) até `toIdx`, parando na data final (inclusiva), se houver.
 */
export function pendingOccurrences(opts: {
  startDate: Date;
  dayOfMonth: number;
  endDate: Date | null;
  generatedThrough: number;
  toIdx: number;
}): Date[] {
  const startIdx = monthIndex(opts.startDate);
  const from = Math.max(startIdx, opts.generatedThrough + 1);
  const out: Date[] = [];
  for (let idx = from; idx <= opts.toIdx; idx++) {
    const date = idx === startIdx ? opts.startDate : dateForMonth(idx, opts.dayOfMonth);
    if (opts.endDate && date.getTime() > opts.endDate.getTime()) break;
    out.push(date);
  }
  return out;
}

/** A série terminou (a próxima ocorrência passaria da data final)? */
export function seriesEnded(endDate: Date | null, dayOfMonth: number, lastIdx: number): boolean {
  if (!endDate) return false;
  return dateForMonth(lastIdx + 1, dayOfMonth).getTime() > endDate.getTime();
}
