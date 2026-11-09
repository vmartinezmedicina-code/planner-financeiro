import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, PaymentMethod, TransactionSource } from "@prisma/client";
import { toCents, fromCents, splitCents } from "@/lib/money";
import { createTransaction, TransactionError } from "@/lib/finance/transactionService";
import { assertMemberInHousehold, ScopeError } from "@/lib/household/householdService";

const createSchema = z.object({
  description: z.string().min(1),
  totalAmount: z.number().positive().optional(),
  totalAmountCents: z.number().int().positive().optional(),
  installmentsCount: z.number().int().min(2).max(60),
  purchaseDate: z.string(), // data da 1ª parcela (data da compra)
  categoryId: z.string().nullable().optional(),
  creditCardId: z.string().min(1),
  memberId: z.string().nullable().optional(),
});

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Corrige overflow de dia (ex: 31/jan + 1 mês vira 3/mar sem este ajuste)
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const purchases = await prisma.installmentPurchase.findMany({
    where: { householdId: session.householdId },
    include: {
      category: true,
      creditCard: true,
      installments: { orderBy: { installmentNumber: "asc" } },
    },
    orderBy: { purchaseDate: "desc" },
  });

  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const d = parsed.data;
  const totalCents = d.totalAmountCents ?? toCents(d.totalAmount ?? 0);
  if (totalCents <= 0) return NextResponse.json({ error: "Valor total inválido." }, { status: 400 });
  const purchaseDate = new Date(d.purchaseDate);

  try {
    const memberId = await assertMemberInHousehold(d.memberId, session.householdId);
    const card = await prisma.creditCard.findFirst({ where: { id: d.creditCardId, householdId: session.householdId }, select: { id: true } });
    if (!card) return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });

    // Divide em centavos inteiros; a diferença de arredondamento vai para as últimas parcelas.
    const parts = splitCents(totalCents, d.installmentsCount);

    const purchase = await prisma.$transaction(async (tx) => {
      const p = await tx.installmentPurchase.create({
        data: {
          description: d.description,
          totalAmount: fromCents(totalCents),
          totalAmountCents: totalCents,
          installmentsCount: d.installmentsCount,
          purchaseDate,
          categoryId: d.categoryId || null,
          creditCardId: card.id,
          userId: session.userId,
          householdId: session.householdId,
        },
      });
      for (let i = 0; i < d.installmentsCount; i++) {
        await createTransaction(
          {
            householdId: session.householdId,
            userId: session.userId,
            eventDate: addMonths(purchaseDate, i),
            categoryId: d.categoryId || null,
            kind: "CARD_PURCHASE",
            paymentMethod: PaymentMethod.CREDITO,
            creditCardId: card.id,
            memberId,
            description: `${d.description} (${i + 1}/${d.installmentsCount})`,
            amountCents: -parts[i],
            status: TransactionStatus.PENDENTE,
            installmentPurchaseId: p.id,
            installmentNumber: i + 1,
            source: TransactionSource.MANUAL,
          },
          tx
        );
      }
      return tx.installmentPurchase.findUnique({ where: { id: p.id }, include: { installments: true } });
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (e) {
    if (e instanceof TransactionError || e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
