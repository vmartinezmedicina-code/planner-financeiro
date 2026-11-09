import { TransactionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listInvoices, type InvoiceView } from "@/lib/invoices/invoiceService";

/**
 * Próximos compromissos conhecidos, derivados do que já está lançado:
 * faturas de cartão não pagas e lançamentos de conta com data futura.
 * (Na Fase 5 entra o cadastro de compromissos recorrentes — FinancialCommitment.)
 */
export type UpcomingItem = {
  id: string;
  source: "INVOICE" | "TRANSACTION";
  /** Data em que o dinheiro sai/entra (ISO). */
  date: string;
  label: string;
  detail: string | null;
  /** Positivo = entrada; negativo = saída. */
  amountCents: number;
  overdue: boolean;
  /** Fatura ainda aberta: o valor pode aumentar até o fechamento. */
  provisional: boolean;
  href: string;
};

const DAY = 86400000;
const BANK_KINDS: TransactionKind[] = [TransactionKind.INCOME, TransactionKind.EXPENSE, TransactionKind.ADJUSTMENT, TransactionKind.CARD_PAYMENT];

export async function getUpcoming(
  householdId: string,
  opts: { today: Date; days: number; invoices?: InvoiceView[] }
): Promise<UpcomingItem[]> {
  const todayMs = Date.UTC(opts.today.getUTCFullYear(), opts.today.getUTCMonth(), opts.today.getUTCDate());
  const afterToday = new Date(todayMs + DAY); // a partir de amanhã (hoje já está no saldo real)
  const limit = new Date(todayMs + (opts.days + 1) * DAY); // exclusivo

  const [invoices, cards, transactions] = await Promise.all([
    opts.invoices ? Promise.resolve(opts.invoices) : listInvoices(householdId, { today: opts.today }),
    prisma.creditCard.findMany({ where: { householdId }, select: { id: true, name: true } }),
    prisma.transaction.findMany({
      where: {
        householdId,
        bankId: { not: null },
        kind: { in: BANK_KINDS },
        OR: [
          { settlementDate: { gte: afterToday, lt: limit } },
          { settlementDate: null, eventDate: { gte: afterToday, lt: limit } },
        ],
      },
      select: { id: true, eventDate: true, settlementDate: true, description: true, amountCents: true, bank: { select: { name: true } } },
      orderBy: { eventDate: "asc" },
      take: 300,
    }),
  ]);
  const cardName = new Map(cards.map((c) => [c.id, c.name]));

  const items: UpcomingItem[] = [];

  for (const inv of invoices) {
    if (inv.status === "PAID" || inv.remainingCents <= 0) continue;
    const dueMs = Date.parse(inv.dueDate);
    if (dueMs >= limit.getTime()) continue;
    items.push({
      id: `invoice:${inv.id}`,
      source: "INVOICE",
      date: inv.dueDate,
      label: `Fatura ${cardName.get(inv.creditCardId) ?? "cartão"} ${inv.label}`,
      detail: inv.status === "OPEN" ? "fatura ainda aberta" : inv.status === "PARTIAL" ? "paga em parte" : null,
      amountCents: -inv.remainingCents,
      overdue: dueMs < todayMs,
      provisional: inv.status === "OPEN",
      href: "/cartoes",
    });
  }

  for (const t of transactions) {
    const date = t.settlementDate ?? t.eventDate;
    items.push({
      id: `transaction:${t.id}`,
      source: "TRANSACTION",
      date: date.toISOString(),
      label: t.description,
      detail: t.bank?.name ?? null,
      amountCents: t.amountCents,
      overdue: false,
      provisional: false,
      href: "/lancamentos",
    });
  }

  return items.sort((a, b) => a.date.localeCompare(b.date));
}
