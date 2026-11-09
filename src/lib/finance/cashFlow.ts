/**
 * Projeção de caixa de curto prazo. Função pura: recebe o saldo real de hoje e
 * os compromissos já conhecidos (lançamentos futuros e faturas a vencer) e
 * devolve o saldo projetado. Nunca mistura realizado com projetado: o saldo
 * de entrada é só o realizado; tudo que soma aqui é previsão.
 */

export type CashFlowItem = {
  /** Data em que o dinheiro entra/sai (ISO). Itens vencidos contam como hoje. */
  date: string;
  /** Positivo = entrada; negativo = saída. */
  amountCents: number;
};

export type CashFlowProjection = {
  days: number;
  startCents: number;
  inflowCents: number;
  outflowCents: number; // valor positivo
  projectedCents: number;
  /** Menor saldo atingido no período e quando (para avisar se fica negativo). */
  lowestCents: number;
  lowestDate: string | null;
  /** Saldo ao fim de cada dia que tem movimento (para gráfico/lista). */
  points: { date: string; balanceCents: number }[];
};

const DAY = 86400000;

export function projectCashFlow(startCents: number, items: CashFlowItem[], today: Date, days: number): CashFlowProjection {
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const limitMs = todayMs + days * DAY;

  const byDay = new Map<number, number>();
  let inflow = 0;
  let outflow = 0;
  for (const item of items) {
    const raw = Date.parse(item.date);
    if (Number.isNaN(raw)) continue;
    const d = new Date(raw);
    let dayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (dayMs > limitMs) continue;
    if (dayMs < todayMs) dayMs = todayMs; // vencido: pesa a partir de hoje
    const cents = Math.round(item.amountCents);
    byDay.set(dayMs, (byDay.get(dayMs) ?? 0) + cents);
    if (cents >= 0) inflow += cents;
    else outflow += -cents;
  }

  let balance = Math.round(startCents);
  let lowest = balance;
  let lowestDate: string | null = null;
  const points: { date: string; balanceCents: number }[] = [];
  for (const dayMs of [...byDay.keys()].sort((a, b) => a - b)) {
    balance += byDay.get(dayMs)!;
    const iso = new Date(dayMs).toISOString();
    points.push({ date: iso, balanceCents: balance });
    if (balance < lowest) {
      lowest = balance;
      lowestDate = iso;
    }
  }

  return {
    days,
    startCents: Math.round(startCents),
    inflowCents: inflow,
    outflowCents: outflow,
    projectedCents: balance,
    lowestCents: lowest,
    lowestDate,
    points,
  };
}
