import { randomUUID } from "node:crypto";
import { TransactionKind, TransactionSource, TransactionStatus, PaymentMethod } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";

export class TransferError extends Error {}

export type TransferInput = {
  householdId: string;
  userId: string;
  fromBankId: string;
  toBankId: string;
  amountCents: number; // sempre positivo
  date: Date;
  description?: string;
  memberId?: string | null;
};

/**
 * Transferência entre contas próprias: dois lançamentos TRANSFER ligados por
 * `transferGroupId` (origem negativa, destino positiva). Mexe nos saldos das
 * duas contas, mas não é receita nem despesa e fica fora do planejamento/BI.
 */
export async function createTransfer(input: TransferInput) {
  const amount = Math.round(input.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) throw new TransferError("Valor da transferência inválido.");
  if (input.fromBankId === input.toBankId) throw new TransferError("Escolha contas diferentes.");

  return prisma.$transaction(async (tx) => {
    const banks = await tx.bank.findMany({
      where: { id: { in: [input.fromBankId, input.toBankId] }, householdId: input.householdId },
      select: { id: true, name: true },
    });
    const from = banks.find((b) => b.id === input.fromBankId);
    const to = banks.find((b) => b.id === input.toBankId);
    if (!from || !to) throw new TransferError("Conta não encontrada.");

    const transferGroupId = randomUUID();
    const base = {
      eventDate: input.date,
      settlementDate: input.date,
      kind: TransactionKind.TRANSFER,
      source: TransactionSource.MANUAL,
      paymentMethod: PaymentMethod.PIX,
      status: TransactionStatus.PAGO,
      categoryId: null,
      creditCardId: null,
      transferGroupId,
      userId: input.userId,
      householdId: input.householdId,
      memberId: input.memberId ?? null,
    };
    const label = input.description?.trim() || "Transferência";

    const [out, inn] = await Promise.all([
      tx.transaction.create({
        data: { ...base, bankId: from.id, description: `${label} → ${to.name}`, amount: fromCents(-amount), amountCents: -amount },
      }),
      tx.transaction.create({
        data: { ...base, bankId: to.id, description: `${label} ← ${from.name}`, amount: fromCents(amount), amountCents: amount },
      }),
    ]);

    return { transferGroupId, outId: out.id, inId: inn.id };
  });
}
