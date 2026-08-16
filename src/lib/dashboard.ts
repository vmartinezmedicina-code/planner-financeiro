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

export async function getDashboardData(year: number, month: number, monthsBack = 6) {
  const planning = await getPlanningData(year, month);

  const comparison = [
    ...flattenComparison(planning.receitaRoots),
    ...flattenComparison(planning.despesaRoots),
  ];

  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const [bankGroups, transactions] = await Promise.all([
    prisma.transaction.groupBy({
      by: ["bankInstitution"],
      where: { eventDate: { gte: startOfMonth, lt: startOfNextMonth }, bankInstitution: { not: null } },
      _sum: { amount: true },
    }),
    prisma.transaction.findMany({
      where: { eventDate: { gte: startOfMonth, lt: startOfNextMonth } },
      select: { creditCard: true, amount: true },
    }),
  ]);

  const cardTotals = new Map<string, number>();
  for (const t of transactions) {
    if (!t.creditCard) continue;
    cardTotals.set(t.creditCard, (cardTotals.get(t.creditCard) ?? 0) + t.amount);
  }

  const byBank = bankGroups
    .map((b) => ({ label: b.bankInstitution as string, total: b._sum.amount ?? 0 }))
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

  return {
    summary: planning.summary,
    comparison,
    byBank,
    byCard,
    evolution,
  };
}
