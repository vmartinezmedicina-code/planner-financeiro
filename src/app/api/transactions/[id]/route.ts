import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { TransactionStatus, PaymentMethod } from "@prisma/client";
import { toCents } from "@/lib/money";
import { updateTransaction, deleteTransaction, TransactionError } from "@/lib/finance/transactionService";
import { convertToSeries, deleteSeriesFrom, updateSeriesFrom } from "@/lib/finance/recurrence";
import { prisma } from "@/lib/prisma";
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
  // Ocorrência de recorrência: "one" = só este; "future" = este e os próximos.
  scope: z.enum(["one", "future"]).optional(),
  // Ao marcar como recorrente um lançamento avulso.
  recurrence: z.object({ endDate: z.string().nullable().optional() }).optional(),
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
    const current = await prisma.transaction.findFirst({
      where: { id, householdId: session.householdId },
      select: { recurringSeriesId: true },
    });
    if (!current) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    const inSeries = !!current.recurringSeriesId;

    const patchData = {
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
      // Em série, a marcação de recorrente é da série; avulso só vira série pela conversão abaixo.
      ...(d.isRecurring !== undefined && !inSeries && !d.isRecurring ? { isRecurring: false } : {}),
    };

    const transaction =
      inSeries && d.scope === "future"
        ? await updateSeriesFrom(id, session.householdId, patchData)
        : await updateTransaction(id, session.householdId, patchData);

    if (!inSeries && d.isRecurring === true) {
      const endDate = d.recurrence?.endDate ? new Date(d.recurrence.endDate) : null;
      const r = await convertToSeries(id, session.householdId, endDate);
      return NextResponse.json({ ...transaction, recurringCount: r.count });
    }
    return NextResponse.json(transaction);
  } catch (e) {
    if (e instanceof TransactionError || e instanceof ScopeError) {
      const status = e.message.includes("não encontrado") ? 404 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  // ?scope=future: numa recorrência, exclui este e os próximos e encerra a série.
  const scope = new URL(req.url).searchParams.get("scope");
  const result = scope === "future" ? await deleteSeriesFrom(id, session.householdId) : await deleteTransaction(id, session.householdId);
  return NextResponse.json({ ok: true, ...result });
}
