import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { TransactionStatus, PaymentMethod } from "@prisma/client";
import { toCents } from "@/lib/money";
import { updateTransaction, deleteTransaction, TransactionError } from "@/lib/finance/transactionService";
import { assertMemberInHousehold, ScopeError } from "@/lib/household/householdService";

const updateSchema = z.object({
  eventDate: z.string().optional(),
  settlementDate: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  bankId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  description: z.string().min(1).optional(),
  amount: z.number().optional(),
  amountCents: z.number().int().optional(),
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
  try {
    const memberId = d.memberId !== undefined ? await assertMemberInHousehold(d.memberId, session.householdId) : undefined;
    const amountCents = d.amountCents !== undefined ? d.amountCents : d.amount !== undefined ? toCents(d.amount) : undefined;
    const transaction = await updateTransaction(id, session.householdId, {
      ...(d.eventDate ? { eventDate: new Date(d.eventDate) } : {}),
      ...(d.settlementDate !== undefined ? { settlementDate: d.settlementDate ? new Date(d.settlementDate) : null } : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId || null } : {}),
      ...(d.paymentMethod !== undefined ? { paymentMethod: d.paymentMethod } : {}),
      ...(d.bankId !== undefined ? { bankId: d.bankId || null } : {}),
      ...(d.creditCardId !== undefined ? { creditCardId: d.creditCardId || null } : {}),
      ...(memberId !== undefined ? { memberId } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(amountCents !== undefined ? { amountCents } : {}),
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.isRecurring !== undefined ? { isRecurring: d.isRecurring } : {}),
    });
    return NextResponse.json(transaction);
  } catch (e) {
    if (e instanceof TransactionError || e instanceof ScopeError) {
      const status = e.message.includes("não encontrado") ? 404 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const result = await deleteTransaction(id, session.householdId);
  return NextResponse.json({ ok: true, ...result });
}
