import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, TransactionSource, TransactionKind } from "@prisma/client";
import { CONSUMPTION_KINDS, type TransactionKindValue } from "@/lib/finance/kinds";
import { createTransaction } from "@/lib/finance/transactionService";

const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

// Gera, para o mês informado, uma cópia de cada lançamento recorrente do mês
// anterior. Não duplica: se já existir no mês um lançamento igual (mesma
// descrição, valor, categoria e banco/cartão), ele é pulado — então é seguro
// clicar mais de uma vez. Parcelas, transferências e pagamentos nunca são copiados.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { year, month } = parsed.data;
  const targetStart = new Date(Date.UTC(year, month - 1, 1));
  const targetEnd = new Date(Date.UTC(year, month, 1));
  const prevStart = new Date(Date.UTC(year, month - 2, 1));

  const [source, existing] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        householdId: session.householdId,
        isRecurring: true,
        installmentPurchaseId: null,
        kind: { in: CONSUMPTION_KINDS as TransactionKind[] },
        eventDate: { gte: prevStart, lt: targetStart },
      },
    }),
    prisma.transaction.findMany({
      where: { householdId: session.householdId, eventDate: { gte: targetStart, lt: targetEnd } },
      select: { description: true, amountCents: true, categoryId: true, bankId: true, creditCardId: true },
    }),
  ]);

  const key = (t: { description: string; amountCents: number; categoryId: string | null; bankId: string | null; creditCardId: string | null }) =>
    [t.description, t.amountCents, t.categoryId ?? "", t.bankId ?? "", t.creditCardId ?? ""].join("|");
  const existingKeys = new Set(existing.map(key));

  const daysInTarget = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let created = 0;

  for (const t of source) {
    if (existingKeys.has(key(t))) continue;
    const day = Math.min(t.eventDate.getUTCDate(), daysInTarget);
    await createTransaction({
      householdId: session.householdId,
      userId: session.userId,
      eventDate: new Date(Date.UTC(year, month - 1, day)),
      settlementDate: null,
      categoryId: t.categoryId,
      kind: t.kind as TransactionKindValue,
      paymentMethod: t.paymentMethod,
      bankId: t.bankId,
      creditCardId: t.creditCardId,
      memberId: t.memberId,
      description: t.description,
      amountCents: t.amountCents,
      status: TransactionStatus.PENDENTE,
      isRecurring: true,
      source: TransactionSource.SYSTEM,
    });
    existingKeys.add(key(t));
    created++;
  }

  return NextResponse.json({ created, skipped: source.length - created });
}
