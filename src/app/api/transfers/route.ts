import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { createTransfer, TransferError } from "@/lib/finance/transfers";
import { assertMemberInHousehold, ScopeError } from "@/lib/household/householdService";

const schema = z.object({
  fromBankId: z.string().min(1),
  toBankId: z.string().min(1),
  amount: z.number().positive().optional(),
  amountCents: z.number().int().positive().optional(),
  date: z.string(),
  description: z.string().max(120).optional(),
  memberId: z.string().nullable().optional(),
});

/** Transferência entre contas próprias (par de lançamentos TRANSFER). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const d = parsed.data;
  const amountCents = d.amountCents ?? toCents(d.amount ?? 0);

  try {
    const memberId = await assertMemberInHousehold(d.memberId, session.householdId);
    const result = await createTransfer({
      householdId: session.householdId,
      userId: session.userId,
      fromBankId: d.fromBankId,
      toBankId: d.toBankId,
      amountCents,
      date: new Date(d.date),
      description: d.description,
      memberId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof TransferError || e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
