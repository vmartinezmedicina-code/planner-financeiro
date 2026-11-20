import { CategoryType, TransactionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayAsUtcDate } from "@/lib/format";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";
import { listBanksWithBalance } from "@/lib/finance/banks";
import { goalProgress, shareOfFreeFlow, type GoalProgress } from "./goalCalculator";

export type FreeFlow = {
  /** Receita − despesa do mês (planejadas; sem planejamento, média dos últimos 3 meses realizados). */
  cents: number;
  basis: "PLANNED" | "HISTORY" | "NONE";
};

/** Fluxo mensal livre: quanto sobra por mês para guardar. */
export async function freeMonthlyFlow(householdId: string, today: Date = todayAsUtcDate()): Promise<FreeFlow> {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const planned = await prisma.plannedValue.findMany({
    where: { householdId, year, month },
    select: { amountCents: true, category: { select: { type: true } } },
  });
  const income = planned.filter((p) => p.category.type === CategoryType.RECEITA).reduce((a, p) => a + p.amountCents, 0);
  const expense = planned.filter((p) => p.category.type === CategoryType.DESPESA).reduce((a, p) => a + p.amountCents, 0);
  if (income > 0 || expense > 0) return { cents: income - expense, basis: "PLANNED" };

  // Sem planejamento: média dos 3 meses completos anteriores (receita − despesa realizadas).
  const start = new Date(Date.UTC(year, month - 4, 1));
  const end = new Date(Date.UTC(year, month - 1, 1));
  const agg = await prisma.transaction.aggregate({
    where: { householdId, kind: { in: CONSUMPTION_KINDS as TransactionKind[] }, eventDate: { gte: start, lt: end } },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  if (agg._count._all === 0) return { cents: 0, basis: "NONE" };
  return { cents: Math.round((agg._sum.amountCents ?? 0) / 3), basis: "HISTORY" };
}

export type GoalView = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  strategy: string;
  priority: string;
  status: string;
  targetCents: number;
  initialCents: number;
  targetDate: string | null;
  monthlyPlanCents: number | null;
  linkedBankId: string | null;
  linkedInvestmentId: string | null;
  /** De onde vem o valor atual. */
  currentSource: "CONTRIBUTIONS" | "BANK" | "INVESTMENT";
  linkedName: string | null;
  currentCents: number;
  progress: GoalProgress;
  /** Quanto do fluxo livre o aporte necessário (ou planejado) consome. */
  freeFlowSharePct: number | null;
  contributions: { id: string; amountCents: number; date: string; source: string; note: string | null }[];
};

export type GoalsSummary = {
  freeFlow: FreeFlow;
  activeCount: number;
  reservedCents: number;
  targetCents: number;
  /** Soma do aporte mensal necessário das metas ativas não atingidas. */
  monthlyNeededCents: number;
  monthlyNeededSharePct: number | null;
};

export async function listGoals(householdId: string, today: Date = todayAsUtcDate()): Promise<{ goals: GoalView[]; summary: GoalsSummary }> {
  const [goals, sums, banks, freeFlow] = await Promise.all([
    prisma.financialGoal.findMany({
      where: { householdId },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: {
        linkedInvestment: { select: { product: true, institution: true, currentValueCents: true } },
        linkedBank: { select: { name: true } },
        contributions: { orderBy: { date: "desc" }, take: 30, select: { id: true, amountCents: true, date: true, source: true, note: true } },
      },
    }),
    prisma.goalContribution.groupBy({ by: ["goalId"], where: { householdId }, _sum: { amountCents: true } }),
    listBanksWithBalance(householdId, { asOf: today }),
    freeMonthlyFlow(householdId, today),
  ]);
  const sumByGoal = new Map(sums.map((s) => [s.goalId, s._sum.amountCents ?? 0]));
  const balanceByBank = new Map(banks.map((b) => [b.id, b.currentBalanceCents]));

  const views: GoalView[] = goals.map((g) => {
    let currentCents: number;
    let currentSource: GoalView["currentSource"] = "CONTRIBUTIONS";
    let linkedName: string | null = null;
    if (g.linkedBankId) {
      currentSource = "BANK";
      currentCents = balanceByBank.get(g.linkedBankId) ?? 0;
      linkedName = g.linkedBank?.name ?? null;
    } else if (g.linkedInvestmentId && g.linkedInvestment) {
      currentSource = "INVESTMENT";
      currentCents = g.linkedInvestment.currentValueCents;
      linkedName = `${g.linkedInvestment.product} · ${g.linkedInvestment.institution}`;
    } else {
      currentCents = g.initialAmountCents + (sumByGoal.get(g.id) ?? 0);
    }

    const progress = goalProgress({ targetCents: g.targetAmountCents, currentCents, targetDate: g.targetDate, monthlyPlanCents: g.monthlyPlanCents, today });
    const monthlyForShare = g.monthlyPlanCents ?? progress.monthlyNeededCents;
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      type: g.type,
      strategy: g.strategy,
      priority: g.priority,
      status: g.status,
      targetCents: g.targetAmountCents,
      initialCents: g.initialAmountCents,
      targetDate: g.targetDate ? g.targetDate.toISOString() : null,
      monthlyPlanCents: g.monthlyPlanCents,
      linkedBankId: g.linkedBankId,
      linkedInvestmentId: g.linkedInvestmentId,
      currentSource,
      linkedName,
      currentCents,
      progress,
      freeFlowSharePct: monthlyForShare ? shareOfFreeFlow(monthlyForShare, freeFlow.cents) : null,
      contributions: g.contributions.map((c) => ({ id: c.id, amountCents: c.amountCents, date: c.date.toISOString(), source: c.source, note: c.note })),
    };
  });

  const active = views.filter((v) => v.status === "ACTIVE");
  const monthlyNeededCents = active.filter((v) => !v.progress.achieved).reduce((acc, v) => acc + (v.monthlyPlanCents ?? v.progress.monthlyNeededCents ?? 0), 0);
  return {
    goals: views,
    summary: {
      freeFlow,
      activeCount: active.length,
      reservedCents: active.reduce((acc, v) => acc + Math.max(0, v.currentCents), 0),
      targetCents: active.reduce((acc, v) => acc + v.targetCents, 0),
      monthlyNeededCents,
      monthlyNeededSharePct: monthlyNeededCents > 0 ? shareOfFreeFlow(monthlyNeededCents, freeFlow.cents) : null,
    },
  };
}

export class GoalError extends Error {}

/** Confere vínculos (conta/investimento da mesma família; nunca os dois). */
export async function validateGoalLinks(householdId: string, linkedBankId: string | null | undefined, linkedInvestmentId: string | null | undefined) {
  if (linkedBankId && linkedInvestmentId) throw new GoalError("Vincule a meta a uma conta ou a um investimento, não aos dois.");
  if (linkedBankId) {
    const b = await prisma.bank.findFirst({ where: { id: linkedBankId, householdId }, select: { id: true } });
    if (!b) throw new GoalError("Conta não encontrada.");
  }
  if (linkedInvestmentId) {
    const i = await prisma.investment.findFirst({ where: { id: linkedInvestmentId, householdId }, select: { id: true } });
    if (!i) throw new GoalError("Investimento não encontrado.");
  }
}
