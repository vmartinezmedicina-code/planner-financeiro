import { Prisma, TransactionKind, TransactionStatus, PaymentMethod, TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { todayAsUtcDate } from "@/lib/format";
import { deriveInvoiceStatus, invoiceLabel, resolveInvoicePeriod, type InvoiceStatusValue } from "./invoicePeriod";

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Garante a fatura em que uma compra (eventDate) do cartão cai e devolve seu id.
 * Idempotente: a chave única (cartão, ano, mês) impede duplicar.
 */
export async function ensureInvoiceForPurchase(
  db: Db,
  card: { id: string; closingDay: number | null; dueDay: number | null; householdId: string | null },
  purchaseDate: Date
): Promise<string> {
  const p = resolveInvoicePeriod(card, purchaseDate);
  const inv = await db.creditCardInvoice.upsert({
    where: {
      creditCardId_referenceYear_referenceMonth: {
        creditCardId: card.id,
        referenceYear: p.referenceYear,
        referenceMonth: p.referenceMonth,
      },
    },
    update: {},
    create: {
      creditCardId: card.id,
      householdId: card.householdId,
      referenceYear: p.referenceYear,
      referenceMonth: p.referenceMonth,
      openingDate: p.openingDate,
      closingDate: p.closingDate,
      dueDate: p.dueDate,
    },
    select: { id: true },
  });
  return inv.id;
}

/** Recalcula o cache `totalCents` de uma fatura a partir das compras ligadas a ela. */
export async function recalcInvoiceTotal(db: Db, invoiceId: string): Promise<number> {
  const agg = await db.transaction.aggregate({
    where: { invoiceId, kind: TransactionKind.CARD_PURCHASE },
    _sum: { amountCents: true },
  });
  const total = Math.abs(agg._sum.amountCents ?? 0);
  await db.creditCardInvoice.update({ where: { id: invoiceId }, data: { totalCents: total } });
  return total;
}

export type InvoiceView = {
  id: string;
  creditCardId: string;
  referenceYear: number;
  referenceMonth: number;
  label: string;
  openingDate: string;
  closingDate: string;
  dueDate: string;
  status: InvoiceStatusValue;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paidAt: string | null;
  paymentBankId: string | null;
  purchaseCount: number;
};

/**
 * Faturas de uma família (opcionalmente de um cartão), com totais recalculados
 * a partir das compras e status derivado das datas. Ordenadas da mais recente.
 */
export async function listInvoices(householdId: string, opts: { creditCardId?: string; limit?: number; today?: Date } = {}): Promise<InvoiceView[]> {
  const today = opts.today ?? todayAsUtcDate();
  const invoices = await prisma.creditCardInvoice.findMany({
    where: { householdId, ...(opts.creditCardId ? { creditCardId: opts.creditCardId } : {}) },
    orderBy: [{ referenceYear: "desc" }, { referenceMonth: "desc" }],
    take: opts.limit,
  });
  if (invoices.length === 0) return [];

  const sums = await prisma.transaction.groupBy({
    by: ["invoiceId"],
    where: { invoiceId: { in: invoices.map((i) => i.id) }, kind: TransactionKind.CARD_PURCHASE },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const byInvoice = new Map(sums.map((s) => [s.invoiceId, { total: Math.abs(s._sum.amountCents ?? 0), count: s._count._all }]));

  // Faturas sem compras e sem pagamento (ex.: compras movidas ou excluidas) nao aparecem.
  const visible = invoices.filter((inv) => (byInvoice.get(inv.id)?.count ?? 0) > 0 || inv.paidCents > 0);

  return visible.map((inv) => {
    const agg = byInvoice.get(inv.id) ?? { total: 0, count: 0 };
    const view = { ...inv, totalCents: agg.total };
    const status = deriveInvoiceStatus(view, today);
    return {
      id: inv.id,
      creditCardId: inv.creditCardId,
      referenceYear: inv.referenceYear,
      referenceMonth: inv.referenceMonth,
      label: invoiceLabel(inv.referenceYear, inv.referenceMonth),
      openingDate: inv.openingDate.toISOString(),
      closingDate: inv.closingDate.toISOString(),
      dueDate: inv.dueDate.toISOString(),
      status,
      totalCents: agg.total,
      paidCents: inv.paidCents,
      remainingCents: Math.max(0, agg.total - inv.paidCents),
      paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
      paymentBankId: inv.paymentBankId,
      purchaseCount: agg.count,
    };
  });
}

export class InvoiceError extends Error {}

/**
 * Paga uma fatura a partir de uma conta: cria um lançamento CARD_PAYMENT
 * (sai do saldo da conta, NÃO é despesa), atualiza a fatura e marca as
 * compras como pagas quando a fatura é quitada por completo.
 */
export async function payInvoice(input: {
  invoiceId: string;
  bankId: string;
  amountCents?: number; // default: valor restante
  paidAt?: Date;
  userId: string;
  householdId: string;
  memberId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const inv = await tx.creditCardInvoice.findFirst({
      where: { id: input.invoiceId, householdId: input.householdId },
      include: { creditCard: { select: { id: true, name: true } } },
    });
    if (!inv) throw new InvoiceError("Fatura não encontrada.");
    if (inv.status === "PAID") throw new InvoiceError("Esta fatura já está paga.");

    const bank = await tx.bank.findFirst({ where: { id: input.bankId, householdId: input.householdId }, select: { id: true } });
    if (!bank) throw new InvoiceError("Conta não encontrada.");

    const total = await recalcInvoiceTotal(tx, inv.id);
    const remaining = Math.max(0, total - inv.paidCents);
    const amount = input.amountCents ?? remaining;
    if (!Number.isInteger(amount) || amount <= 0) throw new InvoiceError("Valor do pagamento inválido.");
    if (remaining === 0) throw new InvoiceError("Não há valor em aberto nesta fatura.");

    const paidAt = input.paidAt ?? todayAsUtcDate();
    const payment = await tx.transaction.create({
      data: {
        eventDate: paidAt,
        settlementDate: paidAt,
        description: `Pagamento fatura ${inv.creditCard.name} ${invoiceLabel(inv.referenceYear, inv.referenceMonth)}`,
        amount: fromCents(-amount),
        amountCents: -amount,
        kind: TransactionKind.CARD_PAYMENT,
        source: TransactionSource.SYSTEM,
        paymentMethod: PaymentMethod.DEBITO,
        bankId: bank.id,
        creditCardId: inv.creditCardId,
        invoiceId: inv.id,
        status: TransactionStatus.PAGO,
        userId: input.userId,
        householdId: input.householdId,
        memberId: input.memberId ?? null,
      },
    });

    const paidCents = inv.paidCents + amount;
    const fullyPaid = paidCents >= total;
    await tx.creditCardInvoice.update({
      where: { id: inv.id },
      data: {
        paidCents,
        status: fullyPaid ? "PAID" : "PARTIAL",
        paidAt,
        paymentBankId: bank.id,
        paymentTransactionId: payment.id,
        totalCents: total,
      },
    });

    if (fullyPaid) {
      await tx.transaction.updateMany({
        where: { invoiceId: inv.id, kind: TransactionKind.CARD_PURCHASE },
        data: { status: TransactionStatus.PAGO, settlementDate: paidAt },
      });
    }

    return { paymentId: payment.id, paidCents, totalCents: total, status: fullyPaid ? "PAID" : "PARTIAL" };
  });
}

/** Desfaz o efeito de um pagamento quando o lançamento CARD_PAYMENT é excluído. */
export async function revertInvoicePayment(db: Db, invoiceId: string, amountCents: number) {
  const inv = await db.creditCardInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) return;
  const paidCents = Math.max(0, inv.paidCents - Math.abs(amountCents));
  await db.creditCardInvoice.update({
    where: { id: invoiceId },
    data: {
      paidCents,
      status: paidCents === 0 ? "OPEN" : "PARTIAL",
      paidAt: paidCents === 0 ? null : inv.paidAt,
      paymentBankId: paidCents === 0 ? null : inv.paymentBankId,
      paymentTransactionId: null,
    },
  });
  if (paidCents === 0) {
    await db.transaction.updateMany({
      where: { invoiceId, kind: TransactionKind.CARD_PURCHASE, status: TransactionStatus.PAGO },
      data: { status: TransactionStatus.PENDENTE },
    });
  }
}
