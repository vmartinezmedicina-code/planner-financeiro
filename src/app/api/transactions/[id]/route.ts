import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, PaymentMethod } from "@prisma/client";
import { resolvePaymentLinks } from "@/lib/paymentMethod";

const updateSchema = z.object({
  eventDate: z.string().optional(),
  settlementDate: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  bankId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  isRecurring: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const d = parsed.data;

  // Se a forma de pagamento ou os vínculos de banco/cartão mudaram, recalcula
  // a partir do estado atual do lançamento para garantir que nunca fiquem
  // bankId e creditCardId preenchidos ao mesmo tempo.
  let linkUpdate: { bankId: string | null; creditCardId: string | null } | null = null;
  if (d.paymentMethod !== undefined || d.bankId !== undefined || d.creditCardId !== undefined) {
    const current = await prisma.transaction.findUnique({
      where: { id },
      select: { paymentMethod: true, bankId: true, creditCardId: true },
    });
    if (!current) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });

    const effectivePaymentMethod = d.paymentMethod ?? current.paymentMethod;
    const effectiveBankId = d.bankId !== undefined ? d.bankId || null : current.bankId;
    const effectiveCreditCardId = d.creditCardId !== undefined ? d.creditCardId || null : current.creditCardId;
    linkUpdate = resolvePaymentLinks(effectivePaymentMethod, effectiveBankId, effectiveCreditCardId);
  }

  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      ...(d.eventDate ? { eventDate: new Date(d.eventDate) } : {}),
      ...(d.settlementDate !== undefined ? { settlementDate: d.settlementDate ? new Date(d.settlementDate) : null } : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId || null } : {}),
      ...(d.paymentMethod !== undefined ? { paymentMethod: d.paymentMethod } : {}),
      ...(linkUpdate ? { bankId: linkUpdate.bankId, creditCardId: linkUpdate.creditCardId } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.isRecurring !== undefined ? { isRecurring: d.isRecurring } : {}),
    },
  });

  return NextResponse.json(transaction);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  await prisma.transaction.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
