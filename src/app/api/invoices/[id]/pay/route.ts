import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { toCents } from "@/lib/money";
import { payInvoice, InvoiceError } from "@/lib/invoices/invoiceService";

const schema = z.object({
  bankId: z.string().min(1),
  amount: z.number().positive().optional(),
  amountCents: z.number().int().positive().optional(),
  paidAt: z.string().optional(),
});

/**
 * Paga uma fatura a partir de uma conta. Sem `amount`, paga o valor restante.
 * Cria um lançamento CARD_PAYMENT (sai da conta, não é despesa) e marca a fatura.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  const d = parsed.data;
  const amountCents = d.amountCents ?? (d.amount !== undefined ? toCents(d.amount) : undefined);

  try {
    const result = await payInvoice({
      invoiceId: id,
      bankId: d.bankId,
      amountCents,
      paidAt: d.paidAt ? new Date(d.paidAt) : undefined,
      userId: session.userId,
      householdId: session.householdId,
      memberId: session.memberId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof InvoiceError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
