/**
 * Alerta de orçamento por ritmo — regras puras, sem banco.
 *
 * - OVER (vermelho): realizado acima do planejado. Vale sempre.
 * - WARNING (amarelo): só para gasto VARIÁVEL no mês em andamento, quando já
 *   usou 80%+ do planejado E está à frente do mês (percentual gasto passa o
 *   percentual do mês decorrido em mais de 10 pontos).
 * - Conta FIXA (paga de uma vez: aluguel, plano...) só alerta se passar de 100%.
 * - Mês já encerrado: só OVER.
 */

export type BudgetState = "OK" | "WARNING" | "OVER";
export type CategoryNature = "FIXED" | "VARIABLE";

export type BudgetInfo = {
  state: BudgetState;
  usedPct: number; // realizado / planejado × 100 (1 casa)
  nature: CategoryNature;
  /** Projeção de fechamento do mês no ritmo atual (só gasto variável, mês em andamento). */
  projectedCents: number | null;
  /** Frase curta explicando o estado. */
  reason: string;
};

export const WARNING_USED_PCT = 80;
export const PACE_MARGIN_PCT = 10;

/** Fração do mês decorrida (0–1): 0 para meses futuros, 1 para meses passados. */
export function monthProgress(year: number, month: number, today: Date): number {
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  if (year < ty || (year === ty && month < tm)) return 1;
  if (year > ty || (year === ty && month > tm)) return 0;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return today.getUTCDate() / days;
}

/**
 * Gasto fixo × variável, a partir do histórico de quantidade de lançamentos.
 * Fixo: até ~1 lançamento por mês nos meses anteriores com gasto, ou tudo que
 * entrou no mês veio de lançamento recorrente. Sem histórico: um único
 * lançamento que já cobre 90%+ do planejado é tratado como conta fixa.
 */
export function classifyNature(input: {
  /** Quantidade de lançamentos em cada um dos meses anteriores (até 3). */
  previousCounts: number[];
  currentCount: number;
  currentRecurringCount: number;
  realizedCents: number;
  plannedCents: number;
}): CategoryNature {
  if (input.currentCount > 0 && input.currentRecurringCount === input.currentCount) return "FIXED";
  const active = input.previousCounts.filter((c) => c > 0);
  if (active.length > 0) {
    const avg = active.reduce((a, b) => a + b, 0) / active.length;
    return avg <= 1.2 ? "FIXED" : "VARIABLE";
  }
  if (input.currentCount === 1 && input.plannedCents > 0 && input.realizedCents >= input.plannedCents * 0.9) return "FIXED";
  return "VARIABLE";
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function budgetStatus(input: {
  plannedCents: number;
  realizedCents: number;
  /** Fração do mês decorrida (monthProgress). */
  progress: number;
  nature: CategoryNature;
}): BudgetInfo | null {
  const { plannedCents, realizedCents, progress, nature } = input;
  if (plannedCents <= 0) return null;

  const usedPct = Math.round((realizedCents / plannedCents) * 1000) / 10;
  const running = progress > 0 && progress < 1;
  const projectedCents = nature === "VARIABLE" && running && progress >= 0.2 && realizedCents > 0 ? Math.round(realizedCents / progress) : null;

  if (realizedCents > plannedCents) {
    return { state: "OVER", usedPct, nature, projectedCents, reason: `${brl(realizedCents - plannedCents)} acima do planejado` };
  }
  if (!running) {
    return { state: "OK", usedPct, nature, projectedCents: null, reason: progress >= 1 ? "mês encerrado dentro do planejado" : "mês ainda não começou" };
  }
  if (nature === "FIXED") {
    return { state: "OK", usedPct, nature, projectedCents: null, reason: "conta fixa: só alerta se passar do planejado" };
  }

  const elapsedPct = Math.round(progress * 100);
  if (usedPct >= WARNING_USED_PCT && usedPct > elapsedPct + PACE_MARGIN_PCT) {
    return { state: "WARNING", usedPct, nature, projectedCents, reason: `${Math.round(usedPct)}% gasto com ${elapsedPct}% do mês` };
  }
  return { state: "OK", usedPct, nature, projectedCents, reason: `no ritmo: ${Math.round(usedPct)}% gasto com ${elapsedPct}% do mês` };
}
