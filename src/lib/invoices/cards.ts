import { prisma } from "@/lib/prisma";
import { TransactionKind } from "@prisma/client";
import { fromCents } from "@/lib/money";
import { listInvoices, type InvoiceView } from "@/lib/invoices/invoiceService";

export type CardWithInvoices = {
  id: string;
  name: string;
  institution: string | null;
  limit: number | null;
  closingDay: number | null;
  dueDay: number | null;
  color: string;
  /** Soma de tudo que ainda não foi pago (faturas abertas, fechadas, vencidas, parciais). */
  currentInvoice: number;
  /** Fatura em aberto hoje (a que ainda recebe compras), ou null. */
  openInvoice: InvoiceView | null;
  /** Próxima a vencer com valor em aberto, ou null. */
  nextDue: InvoiceView | null;
  invoices: InvoiceView[];
  transactionCount: number;
  byCategory: { name: string; value: number }[];
};

/** Cartões da família com faturas, usado pela API e pela página. */
export async function listCardsWithInvoices(householdId: string): Promise<CardWithInvoices[]> {
  const [cards, invoices, purchases] = await Promise.all([
    prisma.creditCard.findMany({ where: { householdId }, orderBy: { order: "asc" } }),
    listInvoices(householdId),
    prisma.transaction.findMany({
      where: { householdId, creditCardId: { not: null }, kind: TransactionKind.CARD_PURCHASE, OR: [{ invoiceId: null }, { invoice: { status: { not: "PAID" } } }] },
      select: { creditCardId: true, amountCents: true, category: { select: { name: true } } },
    }),
  ]);

  return cards.map((card) => {
    const mine = invoices.filter((i) => i.creditCardId === card.id);
    const unpaid = mine.filter((i) => i.status !== "PAID" && i.remainingCents > 0);
    const open = mine.find((i) => i.status === "OPEN") ?? null;
    const nextDue = [...unpaid].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;

    const catMap = new Map<string, number>();
    let count = 0;
    for (const t of purchases) {
      if (t.creditCardId !== card.id) continue;
      count++;
      const label = t.category?.name ?? "Sem categoria";
      catMap.set(label, (catMap.get(label) ?? 0) + Math.abs(t.amountCents));
    }

    return {
      id: card.id,
      name: card.name,
      institution: card.institution,
      limit: card.limit,
      closingDay: card.closingDay,
      dueDay: card.dueDay,
      color: card.color,
      currentInvoice: fromCents(unpaid.reduce((acc, i) => acc + i.remainingCents, 0)),
      openInvoice: open,
      nextDue,
      invoices: mine.slice(0, 12),
      transactionCount: count,
      byCategory: [...catMap.entries()].map(([name, value]) => ({ name, value: fromCents(value) })).sort((a, b) => b.value - a.value),
    };
  });
}
