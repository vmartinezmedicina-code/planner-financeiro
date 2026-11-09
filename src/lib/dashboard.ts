import { prisma } from "@/lib/prisma";
import { TransactionKind } from "@prisma/client";
import { getPlanningData, CategoryNode } from "@/lib/planning";
import { MONTH_NAMES, todayAsUtcDate } from "@/lib/format";
import { fromCents } from "@/lib/money";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";
import { listInvoices } from "@/lib/invoices/invoiceService";

function flattenComparison(nodes: CategoryNode[], depth = 0, out: { id: string; name: string; depth: number; planned: number; realized: number }[] = []) {
  for (const n of nodes) {
    if (depth <= 1) {
      out.push({ id: n.id, name: n.name, depth, planned: n.plannedTotal, realized: n.realizedTotal });
    }
    if (depth < 1) flattenComparison(n.children, depth + 1, out);
  }
  return out;
}

export type Breakdown = { name: string; value: number; children: { name: string; value: number }[] };

// Quebra por setor: cada grupo raiz é aberto em suas categorias; cada categoria traz suas subcategorias.
function toBreakdown(roots: CategoryNode[]): Breakdown[] {
  return roots
    .flatMap((r) => (r.children.length ? r.children : [r]))
    .map((c) => ({
      name: c.name,
      value: c.realizedTotal,
      children: c.children
        .map((g) => ({ name: g.name, value: g.realizedTotal }))
        .filter((g) => g.value > 0)
        .sort((a, b) => b.value - a.value),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}

function monthLabel(y: number, m: number) {
  return `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(y).slice(2)}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/**
 * Dados do dashboard. Saída em reais (telas/gráficos ainda consomem reais);
 * cálculo em centavos. Busca intervalos inteiros e agrega em memória em vez
 * de uma query por mês/banco/cartão.
 */
export async function getDashboardData(householdId: string, year: number, month: number, monthsBack = 6) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));
  const first = shiftMonth(year, month, -(monthsBack - 1));
  const windowStart = new Date(Date.UTC(first.y, first.m - 1, 1));
  const last = shiftMonth(year, month, 5);
  const installmentsEnd = new Date(Date.UTC(last.y, last.m, 1));
  const consumption = CONSUMPTION_KINDS as TransactionKind[];

  const [planning, windowTx, banks, bankSums, invoices, cards, upcomingTx] = await Promise.all([
    getPlanningData(householdId, year, month),
    // Lançamentos de consumo dos últimos N meses (evolução + totais por banco/cartão do mês).
    prisma.transaction.findMany({
      where: { householdId, eventDate: { gte: windowStart, lt: startOfNextMonth }, kind: { in: consumption } },
      select: { eventDate: true, amountCents: true, bankId: true, creditCardId: true, bank: { select: { name: true } }, creditCardRef: { select: { name: true } } },
    }),
    prisma.bank.findMany({ where: { householdId }, orderBy: { order: "asc" }, select: { id: true, name: true, initialBalanceCents: true } }),
    prisma.transaction.groupBy({ by: ["bankId"], where: { householdId, bankId: { not: null } }, _sum: { amountCents: true } }),
    listInvoices(householdId),
    prisma.creditCard.findMany({ where: { householdId }, orderBy: { order: "asc" }, select: { id: true, name: true, dueDay: true } }),
    prisma.transaction.findMany({
      where: { householdId, installmentPurchaseId: { not: null }, eventDate: { gte: startOfMonth, lt: installmentsEnd } },
      select: { eventDate: true, amountCents: true },
    }),
  ]);

  const comparison = [...flattenComparison(planning.receitaRoots), ...flattenComparison(planning.despesaRoots)];

  // Totais do mês por banco e por cartão
  const bankTotals = new Map<string, number>();
  const cardTotals = new Map<string, number>();
  const evolutionMap = new Map<string, { receita: number; despesa: number }>();
  for (let i = 0; i < monthsBack; i++) {
    const { y, m } = shiftMonth(first.y, first.m, i);
    evolutionMap.set(`${y}-${m}`, { receita: 0, despesa: 0 });
  }
  for (const t of windowTx) {
    const key = `${t.eventDate.getUTCFullYear()}-${t.eventDate.getUTCMonth() + 1}`;
    const bucket = evolutionMap.get(key);
    if (bucket) {
      if (t.amountCents >= 0) bucket.receita += t.amountCents;
      else bucket.despesa += Math.abs(t.amountCents);
    }
    if (t.eventDate >= startOfMonth) {
      if (t.bank) bankTotals.set(t.bank.name, (bankTotals.get(t.bank.name) ?? 0) + t.amountCents);
      if (t.creditCardRef) cardTotals.set(t.creditCardRef.name, (cardTotals.get(t.creditCardRef.name) ?? 0) + t.amountCents);
    }
  }

  const byBank = [...bankTotals.entries()].map(([label, total]) => ({ label, total: fromCents(total) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  const byCard = [...cardTotals.entries()].map(([label, total]) => ({ label, total: fromCents(total) })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const evolution = [...evolutionMap.entries()].map(([key, v]) => {
    const [y, m] = key.split("-").map(Number);
    return { label: monthLabel(y, m), receita: fromCents(v.receita), despesa: fromCents(v.despesa) };
  });

  // Saldos das contas (todos os kinds mexem no saldo, exceto compra no cartão, que nunca tem bankId)
  const sumByBank = new Map(bankSums.map((s) => [s.bankId, s._sum.amountCents ?? 0]));
  const bankBalances = banks.map((b) => ({ label: b.name, total: fromCents(b.initialBalanceCents + (sumByBank.get(b.id) ?? 0)) }));
  const totalBankBalance = fromCents(banks.reduce((acc, b) => acc + b.initialBalanceCents + (sumByBank.get(b.id) ?? 0), 0));

  // Faturas: em aberto = tudo que ainda não foi pago (abertas, fechadas, vencidas, parciais)
  const unpaid = invoices.filter((i) => i.status !== "PAID" && i.remainingCents > 0);
  const totalOpenInvoices = fromCents(unpaid.reduce((acc, i) => acc + i.remainingCents, 0));

  const todayMid = todayAsUtcDate().getTime();
  const cardName = new Map(cards.map((c) => [c.id, c.name]));
  const dueAlerts = unpaid
    .map((i) => ({ card: cardName.get(i.creditCardId) ?? "Cartão", open: fromCents(i.remainingCents), daysLeft: Math.round((new Date(i.dueDate).getTime() - todayMid) / 86400000), label: i.label }))
    .filter((a) => a.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  // Por cartão: soma em aberto + próxima fatura a vencer
  const cardInvoices = cards.map((c) => {
    const mine = unpaid.filter((i) => i.creditCardId === c.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const next = mine[0];
    return {
      label: c.name,
      open: fromCents(mine.reduce((acc, i) => acc + i.remainingCents, 0)),
      dueDay: c.dueDay,
      nextDue: next ? next.dueDate : null,
      nextLabel: next ? next.label : null,
    };
  });

  // Parcelas dos próximos 6 meses (a partir do mês selecionado)
  const upcomingMap = new Map<string, number>();
  for (let i = 0; i < 6; i++) {
    const { y, m } = shiftMonth(year, month, i);
    upcomingMap.set(`${y}-${m}`, 0);
  }
  for (const t of upcomingTx) {
    const key = `${t.eventDate.getUTCFullYear()}-${t.eventDate.getUTCMonth() + 1}`;
    if (upcomingMap.has(key)) upcomingMap.set(key, (upcomingMap.get(key) ?? 0) + Math.abs(t.amountCents));
  }
  const upcomingInstallments = [...upcomingMap.entries()].map(([key, total]) => {
    const [y, m] = key.split("-").map(Number);
    return { label: monthLabel(y, m), total: fromCents(total) };
  });

  const topCategories = planning.despesaRoots
    .flatMap((r) => r.children)
    .map((c) => ({ name: c.name, value: c.realizedTotal }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const prevDespesa = evolution.length >= 2 ? evolution[evolution.length - 2].despesa : 0;
  const currDespesa = evolution.length >= 1 ? evolution[evolution.length - 1].despesa : 0;
  const despesaDeltaPct = prevDespesa > 0 ? ((currDespesa - prevDespesa) / prevDespesa) * 100 : null;

  return {
    summary: planning.summary,
    comparison,
    byBank,
    byCard,
    evolution,
    totalBankBalance,
    bankBalances,
    totalOpenInvoices,
    dueAlerts,
    upcomingInstallments,
    topCategories,
    despesaDeltaPct,
    receitaBreakdown: toBreakdown(planning.receitaRoots),
    despesaBreakdown: toBreakdown(planning.despesaRoots),
    cardInvoices,
  };
}
