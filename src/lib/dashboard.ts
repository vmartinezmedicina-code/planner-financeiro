import { prisma } from "@/lib/prisma";
import { getPlanningData, CategoryNode } from "@/lib/planning";
import { MONTH_NAMES } from "@/lib/format";

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

export async function getDashboardData(year: number, month: number, monthsBack = 6) {
  const planning = await getPlanningData(year, month);

  const comparison = [
    ...flattenComparison(planning.receitaRoots),
    ...flattenComparison(planning.despesaRoots),
  ];

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const transactions = await prisma.transaction.findMany({
    where: { eventDate: { gte: startOfMonth, lt: startOfNextMonth } },
    select: { amount: true, bank: { select: { name: true } }, creditCardRef: { select: { name: true } } },
  });

  const bankTotals = new Map<string, number>();
  const cardTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.bank) bankTotals.set(t.bank.name, (bankTotals.get(t.bank.name) ?? 0) + t.amount);
    if (t.creditCardRef) cardTotals.set(t.creditCardRef.name, (cardTotals.get(t.creditCardRef.name) ?? 0) + t.amount);
  }

  const byBank = [...bankTotals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  const byCard = [...cardTotals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // Evolução dos últimos N meses
  const evolution: { label: string; receita: number; despesa: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    const s = new Date(Date.UTC(y, m - 1, 1));
    const e = new Date(Date.UTC(y, m, 1));
    const agg = await prisma.transaction.aggregate({
      where: { eventDate: { gte: s, lt: e }, amount: { gt: 0 } },
      _sum: { amount: true },
    });
    const aggNeg = await prisma.transaction.aggregate({
      where: { eventDate: { gte: s, lt: e }, amount: { lt: 0 } },
      _sum: { amount: true },
    });
    evolution.push({
      label: `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(y).slice(2)}`,
      receita: agg._sum.amount ?? 0,
      despesa: Math.abs(aggNeg._sum.amount ?? 0),
    });
  }

  // --- Indicadores gerais (não dependem só do mês selecionado) ---
  const banks = await prisma.bank.findMany({ orderBy: { order: "asc" } });
  const bankBalances = await Promise.all(
    banks.map(async (b) => {
      const agg = await prisma.transaction.aggregate({ where: { bankId: b.id }, _sum: { amount: true } });
      return { label: b.name, total: b.initialBalance + (agg._sum.amount ?? 0) };
    })
  );
  const totalBankBalance = bankBalances.reduce((acc, b) => acc + b.total, 0);

  // Faturas em aberto = lançamentos de cartão ainda pendentes, por cartão.
  const cards = await prisma.creditCard.findMany({ orderBy: { order: "asc" } });
  const openInvoices = await Promise.all(
    cards.map(async (c) => {
      const agg = await prisma.transaction.aggregate({
        where: { creditCardId: c.id, status: "PENDENTE" },
        _sum: { amount: true },
      });
      return { id: c.id, name: c.name, dueDay: c.dueDay, open: Math.abs(agg._sum.amount ?? 0) };
    })
  );
  const totalOpenInvoices = openInvoices.reduce((acc, c) => acc + c.open, 0);

  // Alertas: fatura em aberto vencendo nos próximos 7 dias (ou já vencida neste mês).
  const today = new Date();
  const dueAlerts: { card: string; open: number; daysLeft: number }[] = [];
  for (const c of openInvoices) {
    if (!c.dueDay || c.open <= 0) continue;
    let due = new Date(today.getFullYear(), today.getMonth(), c.dueDay);
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (due < todayMid) due = new Date(today.getFullYear(), today.getMonth() + 1, c.dueDay);
    const daysLeft = Math.round((due.getTime() - todayMid.getTime()) / 86400000);
    if (daysLeft <= 7) dueAlerts.push({ card: c.name, open: c.open, daysLeft });
  }
  dueAlerts.sort((a, b) => a.daysLeft - b.daysLeft);

  // Parcelas dos próximos 6 meses (a partir do mês selecionado).
  const upcomingInstallments: { label: string; total: number }[] = [];
  for (let i = 0; i < 6; i++) {
    let y = year;
    let m = month + i;
    while (m > 12) {
      m -= 12;
      y += 1;
    }
    const s = new Date(Date.UTC(y, m - 1, 1));
    const e = new Date(Date.UTC(y, m, 1));
    const agg = await prisma.transaction.aggregate({
      where: { installmentPurchaseId: { not: null }, eventDate: { gte: s, lt: e } },
      _sum: { amount: true },
    });
    upcomingInstallments.push({
      label: `${MONTH_NAMES[m - 1].slice(0, 3)}/${String(y).slice(2)}`,
      total: Math.abs(agg._sum.amount ?? 0),
    });
  }

  // Maiores categorias de despesa do mês (nível 1 abaixo da raiz).
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
    cardInvoices: openInvoices.map((c) => ({ label: c.name, open: c.open, dueDay: c.dueDay })),
  };
}
