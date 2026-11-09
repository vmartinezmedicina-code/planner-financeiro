import { Prisma, TransactionKind, TransactionSource, TransactionStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { deriveKind, normalizeSign, paymentMethodForKind, resolveLinksForKind, type TransactionKindValue } from "./kinds";
import { ensureInvoiceForPurchase, recalcInvoiceTotal, revertInvoicePayment } from "@/lib/invoices/invoiceService";

type Db = Prisma.TransactionClient | typeof prisma;

export class TransactionError extends Error {}

export type CreateTransactionInput = {
  householdId: string;
  userId: string;
  eventDate: Date;
  settlementDate?: Date | null;
  description: string;
  /** Valor em centavos. O sinal é normalizado conforme o kind. */
  amountCents: number;
  kind?: TransactionKindValue;
  paymentMethod?: PaymentMethod;
  bankId?: string | null;
  creditCardId?: string | null;
  categoryId?: string | null;
  memberId?: string | null;
  status?: TransactionStatus;
  isRecurring?: boolean;
  source?: TransactionSource;
  installmentPurchaseId?: string | null;
  installmentNumber?: number | null;
  transferGroupId?: string | null;
};

/**
 * Cria um lançamento aplicando as regras de integridade da V2:
 * kind derivado/validado, sinal normalizado, vínculos (conta × cartão)
 * coerentes com o kind, fatura atribuída a compras no cartão e escrita
 * dupla amount/amountCents.
 */
export async function createTransaction(input: CreateTransactionInput, db: Db = prisma) {
  const kind = input.kind ?? deriveKind(input.paymentMethod ?? "DEBITO", input.amountCents);
  const amountCents = normalizeSign(kind, Math.round(input.amountCents));
  const links = resolveLinksForKind(kind, input.bankId ?? null, input.creditCardId ?? null);
  const paymentMethod = paymentMethodForKind(kind, input.paymentMethod);

  let invoiceId: string | null = null;
  if (kind === "CARD_PURCHASE") {
    if (!links.creditCardId) throw new TransactionError("Compra no cartão precisa de um cartão.");
    const card = await db.creditCard.findFirst({
      where: { id: links.creditCardId, householdId: input.householdId },
      select: { id: true, closingDay: true, dueDay: true, householdId: true },
    });
    if (!card) throw new TransactionError("Cartão não encontrado.");
    invoiceId = await ensureInvoiceForPurchase(db, card, input.eventDate);
  } else if (links.bankId) {
    const bank = await db.bank.findFirst({ where: { id: links.bankId, householdId: input.householdId }, select: { id: true } });
    if (!bank) throw new TransactionError("Conta não encontrada.");
  }

  const created = await db.transaction.create({
    data: {
      eventDate: input.eventDate,
      settlementDate: input.settlementDate ?? null,
      description: input.description,
      amount: fromCents(amountCents),
      amountCents,
      kind: kind as TransactionKind,
      source: input.source ?? TransactionSource.MANUAL,
      paymentMethod: paymentMethod as PaymentMethod,
      bankId: links.bankId,
      creditCardId: links.creditCardId,
      invoiceId,
      categoryId: input.categoryId ?? null,
      memberId: input.memberId ?? null,
      status: input.status ?? TransactionStatus.PENDENTE,
      isRecurring: input.isRecurring ?? false,
      installmentPurchaseId: input.installmentPurchaseId ?? null,
      installmentNumber: input.installmentNumber ?? null,
      transferGroupId: input.transferGroupId ?? null,
      userId: input.userId,
      householdId: input.householdId,
    },
  });

  if (invoiceId) await recalcInvoiceTotal(db, invoiceId);
  return created;
}

export type UpdateTransactionInput = Partial<{
  eventDate: Date;
  settlementDate: Date | null;
  description: string;
  amountCents: number;
  paymentMethod: PaymentMethod;
  bankId: string | null;
  creditCardId: string | null;
  categoryId: string | null;
  memberId: string | null;
  status: TransactionStatus;
  isRecurring: boolean;
}>;

const CONSUMER_KINDS: TransactionKindValue[] = ["INCOME", "EXPENSE", "CARD_PURCHASE"];

/**
 * Atualiza um lançamento. Para receita/despesa/compra no cartão, o kind é
 * rederivado (forma de pagamento + sinal) e a fatura reatribuída se a data
 * ou o cartão mudaram. Transferências, pagamentos de fatura e ajustes
 * mantêm o kind e os vínculos; só descrição, datas, membro e status mudam.
 */
export async function updateTransaction(id: string, householdId: string, patch: UpdateTransactionInput) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.transaction.findFirst({ where: { id, householdId } });
    if (!current) throw new TransactionError("Lançamento não encontrado.");

    const currentKind = current.kind as TransactionKindValue;
    const isConsumer = CONSUMER_KINDS.includes(currentKind);

    const amountCentsRaw = patch.amountCents !== undefined ? Math.round(patch.amountCents) : current.amountCents;
    const paymentMethod = patch.paymentMethod ?? current.paymentMethod;
    const bankId = patch.bankId !== undefined ? patch.bankId : current.bankId;
    const creditCardId = patch.creditCardId !== undefined ? patch.creditCardId : current.creditCardId;
    const eventDate = patch.eventDate ?? current.eventDate;

    const kind: TransactionKindValue = isConsumer ? deriveKind(paymentMethod, amountCentsRaw) : currentKind;
    const amountCents = normalizeSign(kind, amountCentsRaw);
    const links = isConsumer ? resolveLinksForKind(kind, bankId, creditCardId) : { bankId: current.bankId, creditCardId: current.creditCardId };
    const effectivePaymentMethod = isConsumer ? paymentMethodForKind(kind, paymentMethod) : current.paymentMethod;

    let invoiceId = current.invoiceId;
    if (isConsumer) {
      if (kind === "CARD_PURCHASE") {
        if (!links.creditCardId) throw new TransactionError("Compra no cartão precisa de um cartão.");
        const needsReassign =
          !invoiceId || links.creditCardId !== current.creditCardId || eventDate.getTime() !== current.eventDate.getTime();
        if (needsReassign) {
          const card = await tx.creditCard.findFirst({
            where: { id: links.creditCardId, householdId },
            select: { id: true, closingDay: true, dueDay: true, householdId: true },
          });
          if (!card) throw new TransactionError("Cartão não encontrado.");
          invoiceId = await ensureInvoiceForPurchase(tx, card, eventDate);
        }
      } else {
        invoiceId = null;
      }
    }

    const updated = await tx.transaction.update({
      where: { id },
      data: {
        eventDate,
        ...(patch.settlementDate !== undefined ? { settlementDate: patch.settlementDate } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        amount: fromCents(amountCents),
        amountCents,
        kind: kind as TransactionKind,
        paymentMethod: effectivePaymentMethod as PaymentMethod,
        bankId: links.bankId,
        creditCardId: links.creditCardId,
        invoiceId,
        ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
        ...(patch.memberId !== undefined ? { memberId: patch.memberId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.isRecurring !== undefined ? { isRecurring: patch.isRecurring } : {}),
      },
    });

    if (current.invoiceId && current.invoiceId !== invoiceId) await recalcInvoiceTotal(tx, current.invoiceId);
    if (invoiceId && kind === "CARD_PURCHASE") await recalcInvoiceTotal(tx, invoiceId);
    return updated;
  });
}

/**
 * Exclui um lançamento mantendo a integridade: transferência remove os dois
 * lados; pagamento de fatura reabre a fatura; compra no cartão recalcula a fatura.
 */
export async function deleteTransaction(id: string, householdId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.transaction.findFirst({ where: { id, householdId } });
    if (!current) return { deleted: 0 };

    if (current.kind === TransactionKind.TRANSFER && current.transferGroupId) {
      const res = await tx.transaction.deleteMany({ where: { transferGroupId: current.transferGroupId, householdId } });
      return { deleted: res.count };
    }

    if (current.kind === TransactionKind.CARD_PAYMENT && current.invoiceId) {
      await revertInvoicePayment(tx, current.invoiceId, current.amountCents);
    }

    await tx.transaction.delete({ where: { id } });

    if (current.kind === TransactionKind.CARD_PURCHASE && current.invoiceId) {
      await recalcInvoiceTotal(tx, current.invoiceId);
    }
    return { deleted: 1 };
  });
}

export async function deleteTransactions(ids: string[], householdId: string) {
  let deleted = 0;
  for (const id of ids) {
    const r = await deleteTransaction(id, householdId);
    deleted += r.deleted;
  }
  return { deleted };
}
