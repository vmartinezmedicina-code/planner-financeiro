/**
 * Cálculos de metas — funções puras, em centavos. A IA nunca faz estas contas.
 *
 * Meses restantes = diferença de meses entre hoje e a data desejada (mínimo 1
 * enquanto a data não passou). Ex.: hoje em novembro, meta para julho → 8
 * meses de aporte (dez, jan, ..., jul).
 */

export type GoalProgressInput = {
  targetCents: number;
  currentCents: number;
  targetDate: Date | null;
  monthlyPlanCents?: number | null;
  today: Date;
};

export type GoalProgress = {
  remainingCents: number;
  percent: number; // 0–100 (1 casa), pode passar de 100
  achieved: boolean;
  /** null quando não há data desejada. 0 quando a data já passou. */
  monthsLeft: number | null;
  weeksLeft: number | null;
  monthlyNeededCents: number | null;
  weeklyNeededCents: number | null;
  overdue: boolean;
  /** Com o aporte mensal planejado: quando chega lá e se cumpre o prazo. */
  plan: { months: number | null; reachDate: string | null; onTrack: boolean | null } | null;
};

function monthIdx(d: Date) {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function addMonthsKeepDay(base: Date, months: number): Date {
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(base.getUTCDate(), last)));
}

export function monthsUntil(today: Date, target: Date): number {
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (target.getTime() < todayMs) return 0;
  return Math.max(1, monthIdx(target) - monthIdx(today));
}

/** Meses para juntar o que falta com um aporte mensal fixo (null se aporte ≤ 0). */
export function monthsToReach(remainingCents: number, monthlyCents: number): number | null {
  if (remainingCents <= 0) return 0;
  if (!monthlyCents || monthlyCents <= 0) return null;
  return Math.ceil(remainingCents / monthlyCents);
}

export function goalProgress(input: GoalProgressInput): GoalProgress {
  const { targetCents, currentCents, targetDate, today } = input;
  const remainingCents = Math.max(0, targetCents - currentCents);
  const achieved = targetCents > 0 && currentCents >= targetCents;
  const percent = targetCents > 0 ? Math.round((currentCents / targetCents) * 1000) / 10 : 0;

  let monthsLeft: number | null = null;
  let weeksLeft: number | null = null;
  let monthlyNeededCents: number | null = null;
  let weeklyNeededCents: number | null = null;
  let overdue = false;

  if (targetDate) {
    monthsLeft = monthsUntil(today, targetDate);
    const days = Math.max(0, Math.round((targetDate.getTime() - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86400000));
    weeksLeft = days > 0 ? Math.max(1, Math.ceil(days / 7)) : 0;
    overdue = monthsLeft === 0 && !achieved;
    if (!achieved && monthsLeft > 0) {
      monthlyNeededCents = Math.ceil(remainingCents / monthsLeft);
      weeklyNeededCents = weeksLeft > 0 ? Math.ceil(remainingCents / weeksLeft) : null;
    } else if (achieved) {
      monthlyNeededCents = 0;
      weeklyNeededCents = 0;
    }
  }

  let plan: GoalProgress["plan"] = null;
  if (input.monthlyPlanCents && input.monthlyPlanCents > 0) {
    const months = monthsToReach(remainingCents, input.monthlyPlanCents);
    const reach = months === null ? null : addMonthsKeepDay(today, months);
    plan = {
      months,
      reachDate: reach ? reach.toISOString() : null,
      onTrack: targetDate && reach ? monthIdx(reach) <= monthIdx(targetDate) : null,
    };
  }

  return { remainingCents, percent, achieved, monthsLeft, weeksLeft, monthlyNeededCents, weeklyNeededCents, overdue, plan };
}

/**
 * Cenário "e se": recalcula sem alterar a meta. Informe um aporte mensal para
 * saber o prazo, ou um prazo (meses) para saber o aporte.
 */
export function simulateGoal(input: {
  targetCents: number;
  currentCents: number;
  today: Date;
  monthlyCents?: number;
  months?: number;
}): { remainingCents: number; months: number | null; monthlyCents: number | null; reachDate: string | null } {
  const remainingCents = Math.max(0, input.targetCents - input.currentCents);
  if (input.monthlyCents !== undefined) {
    const months = monthsToReach(remainingCents, input.monthlyCents);
    return {
      remainingCents,
      months,
      monthlyCents: input.monthlyCents,
      reachDate: months === null ? null : addMonthsKeepDay(input.today, months).toISOString(),
    };
  }
  if (input.months !== undefined && input.months > 0) {
    return {
      remainingCents,
      months: input.months,
      monthlyCents: Math.ceil(remainingCents / input.months),
      reachDate: addMonthsKeepDay(input.today, input.months).toISOString(),
    };
  }
  return { remainingCents, months: null, monthlyCents: null, reachDate: null };
}

/** Quanto do fluxo mensal livre um aporte consome (%), ou null sem fluxo livre positivo. */
export function shareOfFreeFlow(monthlyCents: number, freeFlowCents: number): number | null {
  if (freeFlowCents <= 0) return null;
  return Math.round((monthlyCents / freeFlowCents) * 1000) / 10;
}

/**
 * Compra planejada: guardar e comprar à vista × parcelar. Apresenta os
 * cenários; não decide. Sem juros (o usuário compara com a taxa da loja).
 */
export function purchaseScenarios(input: {
  priceCents: number;
  savedCents: number;
  monthsUntilPurchase: number | null;
  installments: number;
  freeFlowCents: number;
}) {
  const remaining = Math.max(0, input.priceCents - input.savedCents);
  const saveMonthly = input.monthsUntilPurchase && input.monthsUntilPurchase > 0 ? Math.ceil(remaining / input.monthsUntilPurchase) : null;
  const n = Math.max(1, Math.floor(input.installments));
  const installmentCents = Math.ceil(input.priceCents / n);
  return {
    cash: { monthlyCents: saveMonthly, months: input.monthsUntilPurchase, shareOfFreeFlow: saveMonthly === null ? null : shareOfFreeFlow(saveMonthly, input.freeFlowCents) },
    installments: { count: n, installmentCents, shareOfFreeFlow: shareOfFreeFlow(installmentCents, input.freeFlowCents) },
  };
}
