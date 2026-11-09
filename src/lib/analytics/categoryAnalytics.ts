import { TransactionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CONSUMPTION_KINDS } from "@/lib/finance/kinds";
import { buildCategoryAnalysis, shiftMonth, type CategoryAnalysis, type CategoryTypeValue } from "./categoryTree";

export type CategoryTransaction = {
  id: string;
  date: string;
  description: string;
  amountCents: number;
  categoryName: string | null;
  where: string | null; // conta ou cartão
  memberName: string | null;
  installment: string | null;
};

export type CategoryAnalysisResponse = CategoryAnalysis & {
  year: number;
  month: number;
  transactions: CategoryTransaction[];
  transactionCount: number;
};

const MONTHS_BACK = 6;
const MAX_TRANSACTIONS = 100;

/**
 * Análise de um nó da árvore de categorias no mês: totais, planejado, mês
 * anterior, filhos, tendência de 6 meses e os lançamentos do nó. Só
 * lançamentos de consumo entram. Uma consulta para a janela de 6 meses e
 * outra para a lista do mês.
 */
export async function getCategoryAnalysis(
  householdId: string,
  params: { type: CategoryTypeValue; categoryId: string | null; year: number; month: number }
): Promise<CategoryAnalysisResponse | null> {
  const { year, month } = params;
  const first = shiftMonth(year, month, -(MONTHS_BACK - 1));
  const windowStart = new Date(Date.UTC(first.year, first.month - 1, 1));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 1));
  const consumption = CONSUMPTION_KINDS as TransactionKind[];

  const [categories, planned, tx] = await Promise.all([
    prisma.category.findMany({ where: { householdId }, select: { id: true, name: true, parentId: true, type: true, order: true } }),
    prisma.plannedValue.findMany({ where: { householdId, year, month }, select: { categoryId: true, amountCents: true } }),
    prisma.transaction.findMany({
      where: { householdId, kind: { in: consumption }, eventDate: { gte: windowStart, lt: monthEnd } },
      select: { categoryId: true, amountCents: true, eventDate: true },
    }),
  ]);

  const analysis = buildCategoryAnalysis({
    categories,
    planned: new Map(planned.map((p) => [p.categoryId, p.amountCents])),
    tx: tx.map((t) => ({ categoryId: t.categoryId, amountCents: t.amountCents, year: t.eventDate.getUTCFullYear(), month: t.eventDate.getUTCMonth() + 1 })),
    type: params.type,
    categoryId: params.categoryId,
    year,
    month,
    monthsBack: MONTHS_BACK,
  });
  if (!analysis) return null;

  // Lançamentos do nó no mês. "Sem categoria" precisa do filtro de sinal para separar despesa de receita.
  const ids = analysis.categoryIds.filter((id): id is string => id !== null);
  const includesNone = analysis.categoryIds.includes(null);
  const noneFilter = { categoryId: null, amountCents: params.type === "DESPESA" ? { lt: 0 } : { gte: 0 } };
  const where = {
    householdId,
    kind: { in: consumption },
    eventDate: { gte: monthStart, lt: monthEnd },
    OR: [...(ids.length ? [{ categoryId: { in: ids } }] : []), ...(includesNone ? [noneFilter] : [])],
  };

  const [rows, count] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      take: MAX_TRANSACTIONS,
      select: {
        id: true,
        eventDate: true,
        description: true,
        amountCents: true,
        installmentNumber: true,
        category: { select: { name: true } },
        bank: { select: { name: true } },
        creditCardRef: { select: { name: true } },
        member: { select: { name: true } },
        installmentPurchase: { select: { installmentsCount: true } },
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    ...analysis,
    year,
    month,
    transactionCount: count,
    transactions: rows.map((t) => ({
      id: t.id,
      date: t.eventDate.toISOString(),
      description: t.description,
      amountCents: t.amountCents,
      categoryName: t.category?.name ?? null,
      where: t.creditCardRef?.name ?? t.bank?.name ?? null,
      memberName: t.member?.name ?? null,
      installment: t.installmentNumber && t.installmentPurchase ? `${t.installmentNumber}/${t.installmentPurchase.installmentsCount}` : null,
    })),
  };
}
