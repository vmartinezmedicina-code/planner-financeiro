import { prisma } from "@/lib/prisma";
import { CategoryType } from "@prisma/client";

export type CategoryNode = {
  id: string;
  name: string;
  type: CategoryType;
  order: number;
  parentId: string | null;
  planned: number; // valor planejado próprio (não inclui filhos)
  realized: number; // valor realizado próprio (lançamentos direto nesta categoria)
  plannedTotal: number; // planejado próprio + de todos os descendentes
  realizedTotal: number; // realizado próprio + de todos os descendentes
  children: CategoryNode[];
};

export async function getPlanningData(year: number, month: number) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const [categories, plannedValues, transactions] = await Promise.all([
    prisma.category.findMany({ orderBy: { order: "asc" } }),
    prisma.plannedValue.findMany({ where: { year, month } }),
    prisma.transaction.findMany({
      where: { eventDate: { gte: startOfMonth, lt: startOfNextMonth } },
      select: { categoryId: true, amount: true },
    }),
  ]);

  const plannedByCategory = new Map<string, number>();
  for (const pv of plannedValues) plannedByCategory.set(pv.categoryId, pv.amount);

  const realizedByCategory = new Map<string, number>();
  for (const t of transactions) {
    if (!t.categoryId) continue;
    realizedByCategory.set(t.categoryId, (realizedByCategory.get(t.categoryId) ?? 0) + Math.abs(t.amount));
  }

  const byId = new Map<string, CategoryNode>();
  for (const c of categories) {
    byId.set(c.id, {
      id: c.id,
      name: c.name,
      type: c.type,
      order: c.order,
      parentId: c.parentId,
      planned: plannedByCategory.get(c.id) ?? 0,
      realized: realizedByCategory.get(c.id) ?? 0,
      plannedTotal: 0,
      realizedTotal: 0,
      children: [],
    });
  }

  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function sortTree(nodes: CategoryNode[]) {
    nodes.sort((a, b) => a.order - b.order);
    for (const n of nodes) sortTree(n.children);
  }
  sortTree(roots);

  function computeTotals(node: CategoryNode): { planned: number; realized: number } {
    let plannedTotal = node.planned;
    let realizedTotal = node.realized;
    for (const child of node.children) {
      const childTotals = computeTotals(child);
      plannedTotal += childTotals.planned;
      realizedTotal += childTotals.realized;
    }
    node.plannedTotal = plannedTotal;
    node.realizedTotal = realizedTotal;
    return { planned: plannedTotal, realized: realizedTotal };
  }
  for (const root of roots) computeTotals(root);

  const receitaRoots = roots.filter((r) => r.type === CategoryType.RECEITA);
  const despesaRoots = roots.filter((r) => r.type === CategoryType.DESPESA);

  const totalReceitaPlanned = sum(receitaRoots, "plannedTotal");
  const totalReceitaRealized = sum(receitaRoots, "realizedTotal");
  const totalDespesaPlanned = sum(despesaRoots, "plannedTotal");
  const totalDespesaRealized = sum(despesaRoots, "realizedTotal");

  return {
    receitaRoots,
    despesaRoots,
    summary: {
      plannedBalance: totalReceitaPlanned - totalDespesaPlanned,
      realizedBalance: totalReceitaRealized - totalDespesaRealized,
      totalReceitaPlanned,
      totalReceitaRealized,
      totalDespesaPlanned,
      totalDespesaRealized,
    },
  };
}

function sum(nodes: CategoryNode[], key: "plannedTotal" | "realizedTotal") {
  return nodes.reduce((acc, n) => acc + n[key], 0);
}
