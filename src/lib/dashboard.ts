import { prisma } from "@/lib/prisma";
import { TransactionKind } from "@prisma/client";
import { todayAsUtcDate } from "@/lib/format";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";
import { listBanksWithBalance } from "@/lib/finance/banks";
import { projectCashFlow, type CashFlowProjection } from "@/lib/finance/cashFlow";
import { listInvoices, type InvoiceView } from "@/lib/invoices/invoiceService";
import { getUpcoming, type UpcomingItem } from "@/lib/calendar/upcoming";
import { buildCategoryAnalysis, shiftMonth, type TxRow } from "@/lib/analytics/categoryTree";

export const UPCOMING_DAYS = 30;
const EVOLUTION_MONTHS = 6;
const INSTALLMENT_MONTHS = 6;

type InvoiceRef = { label: string; dueDate: string; remainingCents: number; status: InvoiceView["status"] };

export type DashboardData = {
  year: number;
  month: number;
  /** O mês exibido é o mês corrente (no fuso do app)? */
  isCurrentMonth: boolean;
  /** Competência do mês exibido (só lançamentos de consumo). */
  period: {
    receitaRealizedCents: number;
    receitaPlannedCents: number;
    despesaRealizedCents: number;
    despesaPlannedCents: number;
    balanceCents: number;
    /** Variação contra o mês anterior; null sem base de comparação. */
    receitaChangePct: number | null;
    despesaChangePct: number | null;
    /** Despesa realizada / planejada (0–∞); null sem orçamento. */
    budgetUsedPct: number | null;
    /** Receita do mês que ainda não entrou: lançada com data futura ou planejada e não lançada. */
    expectedIncomeCents: number;
  };
  /** Saldo real das contas HOJE (não depende do mês exibido). */
  balance: {
    totalCents: number;
    /** Lançamentos já feitos com data futura (ainda não mexeram no dinheiro). */
    scheduledCents: number;
    accounts: { id: string; name: string; color: string; balanceCents: number; scheduledCents: number }[];
  };
  /** Cartões HOJE: tudo que ainda não foi pago. */
  cards: {
    openCents: number;
    nextDue: (InvoiceRef & { card: string }) | null;
    items: { id: string; name: string; color: string; openCents: number; next: InvoiceRef | null }[];
    installments: { year: number; month: number; cents: number }[];
  };
  alerts: { card: string; label: string; remainingCents: number; daysLeft: number }[];
  evolution: { year: number; month: number; receitaCents: number; despesaCents: number }[];
  upcoming: { days: number; items: UpcomingItem[]; outflowCents: number; inflowCents: number; outflowCount: number };
  /** Saldo projetado = saldo real + entradas − saídas já conhecidas nos próximos dias. */
  projection: CashFlowProjection;
};

/**
 * Dados do dashboard, em centavos. Consultas independentes rodam em paralelo
 * e os meses são agregados em memória (uma consulta para a janela inteira).
 */
export async function getDashboardData(householdId: string, year: number, month: number): Promise<DashboardData> {
  const today = todayAsUtcDate();
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));
  const first = shiftMonth(year, month, -(EVOLUTION_MONTHS - 1));
  const windowStart = new Date(Date.UTC(first.year, first.month - 1, 1));
  const lastInst = shiftMonth(year, month, INSTALLMENT_MONTHS);
  const installmentsEnd = new Date(Date.UTC(lastInst.year, lastInst.month - 1, 1));
  const consumption = CONSUMPTION_KINDS as TransactionKind[];

  const [categories, plannedValues, windowTx, banks, invoices, cards, installmentTx] = await Promise.all([
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, parentId: true, type: true, order: true } }),
    prisma.plannedValue.findMany({ where: { householdId, year, month }, select: { categoryId: true, amountCents: true } }),
    prisma.transaction.findMany({
      where: { householdId, eventDate: { gte: windowStart, lt: startOfNextMonth }, kind: { in: consumption } },
      select: { eventDate: true, amountCents: true, categoryId: true },
    }),
    listBanksWithBalance(householdId, { asOf: today }),
    listInvoices(householdId, { today }),
    prisma.creditCard.findMany({ where: { householdId }, orderBy: { order: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.transaction.findMany({
      where: { householdId, installmentPurchaseId: { not: null }, eventDate: { gte: startOfMonth, lt: installmentsEnd } },
      select: { eventDate: true, amountCents: true },
    }),
  ]);
  const upcomingItems = await getUpcoming(householdId, { today, days: UPCOMING_DAYS, invoices });

  // ---- receitas e despesas: mesmo calculo do painel de detalhe (CategoryExplorer), ----
  // ---- para o indicador e o drill-down mostrarem sempre o mesmo numero.          ----
  const txRows: TxRow[] = windowTx.map((t) => ({
    categoryId: t.categoryId,
    amountCents: t.amountCents,
    year: t.eventDate.getUTCFullYear(),
    month: t.eventDate.getUTCMonth() + 1,
  }));
  const planned = new Map(plannedValues.map((p) => [p.categoryId, p.amountCents]));
  const analysisInput = { categories, planned, tx: txRows, categoryId: null, year, month, monthsBack: EVOLUTION_MONTHS } as const;
  const despesas = buildCategoryAnalysis({ ...analysisInput, type: "DESPESA" })!;
  const receitas = buildCategoryAnalysis({ ...analysisInput, type: "RECEITA" })!;

  const evolution = despesas.trend.map((d, i) => ({ year: d.year, month: d.month, receitaCents: receitas.trend[i].cents, despesaCents: d.cents }));

  const receitaRealizedCents = receitas.node.realizedCents;
  const receitaPlannedCents = receitas.node.plannedCents;
  const despesaRealizedCents = despesas.node.realizedCents;
  const despesaPlannedCents = despesas.node.plannedCents;

  // Receita do mes que ja entrou de fato (data ate hoje). O que foi lancado com
  // data futura, ou planejado e ainda nao lancado, e "previsto".
  const todayEnd = today.getTime() + 86400000;
  const receivedToDateCents = windowTx
    .filter((t) => t.amountCents > 0 && t.eventDate >= startOfMonth && t.eventDate.getTime() < todayEnd)
    .reduce((acc, t) => acc + t.amountCents, 0);
  const expectedIncomeCents = Math.max(0, Math.max(receitaPlannedCents, receitaRealizedCents) - receivedToDateCents);

  // ---- saldo real hoje ----
  const accounts = banks.map((b) => ({ id: b.id, name: b.name, color: b.color, balanceCents: b.currentBalanceCents, scheduledCents: b.scheduledCents }));
  const totalCents = accounts.reduce((acc, a) => acc + a.balanceCents, 0);
  const scheduledCents = accounts.reduce((acc, a) => acc + a.scheduledCents, 0);

  // ---- cartões ----
  const unpaid = invoices.filter((i) => i.status !== "PAID" && i.remainingCents > 0);
  const ref = (i: InvoiceView): InvoiceRef => ({ label: i.label, dueDate: i.dueDate, remainingCents: i.remainingCents, status: i.status });
  const cardItems = cards.map((c) => {
    const mine = unpaid.filter((i) => i.creditCardId === c.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return { id: c.id, name: c.name, color: c.color, openCents: mine.reduce((acc, i) => acc + i.remainingCents, 0), next: mine[0] ? ref(mine[0]) : null };
  });
  const cardName = new Map(cards.map((c) => [c.id, c.name]));
  const nextInvoice = [...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

  const todayMs = today.getTime();
  const alerts = unpaid
    .filter((i) => i.status !== "OPEN")
    .map((i) => ({ card: cardName.get(i.creditCardId) ?? "Cartão", label: i.label, remainingCents: i.remainingCents, daysLeft: Math.round((Date.parse(i.dueDate) - todayMs) / 86400000) }))
    .filter((a) => a.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const instMap = new Map<string, { year: number; month: number; cents: number }>();
  for (let i = 0; i < INSTALLMENT_MONTHS; i++) {
    const m = shiftMonth(year, month, i);
    instMap.set(`${m.year}-${m.month}`, { ...m, cents: 0 });
  }
  for (const t of installmentTx) {
    const bucket = instMap.get(`${t.eventDate.getUTCFullYear()}-${t.eventDate.getUTCMonth() + 1}`);
    if (bucket) bucket.cents += Math.abs(t.amountCents);
  }

  // ---- próximos vencimentos e projeção ----
  const outflows = upcomingItems.filter((i) => i.amountCents < 0);
  const projection = projectCashFlow(totalCents, upcomingItems.map((i) => ({ date: i.date, amountCents: i.amountCents })), today, UPCOMING_DAYS);

  return {
    year,
    month,
    isCurrentMonth: today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month,
    period: {
      receitaRealizedCents,
      receitaPlannedCents,
      despesaRealizedCents,
      despesaPlannedCents,
      balanceCents: receitaRealizedCents - despesaRealizedCents,
      receitaChangePct: receitas.node.changePct,
      despesaChangePct: despesas.node.changePct,
      budgetUsedPct: despesaPlannedCents > 0 ? Math.round((despesaRealizedCents / despesaPlannedCents) * 1000) / 10 : null,
      expectedIncomeCents,
    },
    balance: { totalCents, scheduledCents, accounts },
    cards: {
      openCents: unpaid.reduce((acc, i) => acc + i.remainingCents, 0),
      nextDue: nextInvoice ? { ...ref(nextInvoice), card: cardName.get(nextInvoice.creditCardId) ?? "Cartão" } : null,
      items: cardItems,
      installments: [...instMap.values()],
    },
    alerts,
    evolution,
    upcoming: {
      days: UPCOMING_DAYS,
      items: upcomingItems,
      outflowCents: outflows.reduce((acc, i) => acc - i.amountCents, 0),
      inflowCents: upcomingItems.filter((i) => i.amountCents > 0).reduce((acc, i) => acc + i.amountCents, 0),
      outflowCount: outflows.length,
    },
    projection,
  };
}
