import { prisma } from "@/lib/prisma";
import { CategoryType, TransactionKind } from "@prisma/client";
import { fromCents } from "@/lib/money";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";

export type CategoryNode = {
  id: string;
  name: string;
  type: CategoryType;
  order: number;
  parentId: string | null;
  planned: number; // valor planejado próprio (não inclui filhos) — em reais, para exibição
  realized: number; // valor realizado próprio (lançamentos direto nesta categoria)
  plannedTotal: number; // planejado próprio + de todos os descendentes
  realizedTotal: number; // realizado próprio + de todos os descendentes
  children: CategoryNode[];
};

/**
 * Árvore de categorias com planejado × realizado do mês. Os cálculos são
 * feitos em centavos; a saída é em reais (fromCents) porque as telas e os
 * gráficos ainda consomem reais. Só lançamentos de consumo (receita, despesa,
 * compra no cartão) entram no realizado — transferências, pagamentos de
 * fatura e ajustes ficam de fora.
 */
export async function getPlanningData(householdId: string, year: number, month: number) {
  const startOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const startOfNextMonth = new Date(Date.UTC(year, month, 1));

  const [categories, plannedValues, realizedGroups] = await Promise.all([
    prisma.category.findMany({ where: { householdId }, orderBy: { order: "asc" } }),
    prisma.plannedValue.findMany({ where: { householdId, year, month } }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        householdId,
        eventDate: { gte: startOfMonth, lt: startOfNextMonth },
        kind: { in: CONSUMPTION_KINDS as TransactionKind[] },
        categoryId: { not: null },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const plannedByCategory = new Map<string, number>();
  for (const pv of plannedValues) plannedByCategory.set(pv.categoryId, pv.amountCents);

  const realizedByCategory = new Map<string, number>();
  for (const g of realizedGroups) {
    if (!g.categoryId) continue;
    realizedByCategory.set(g.categoryId, Math.abs(g._sum.amountCents ?? 0));
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

  // Converte a árvore inteira de centavos para reais (saída de exibição).
  function toReais(node: CategoryNode) {
    node.planned = fromCents(node.planned);
    node.realized = fromCents(node.realized);
    node.plannedTotal = fromCents(node.plannedTotal);
    node.realizedTotal = fromCents(node.realizedTotal);
    for (const c of node.children) toReais(c);
  }
  for (const root of roots) toReais(root);

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
      plannedBalance: round2(totalReceitaPlanned - totalDespesaPlanned),
      realizedBalance: round2(totalReceitaRealized - totalDespesaRealized),
      totalReceitaPlanned,
      totalReceitaRealized,
      totalDespesaPlanned,
      totalDespesaRealized,
    },
  };
}

function sum(nodes: CategoryNode[], key: "plannedTotal" | "realizedTotal") {
  return round2(nodes.reduce((acc, n) => acc + n[key], 0));
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}
