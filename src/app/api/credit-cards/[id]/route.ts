import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionKind } from "@prisma/client";
import { ensureInvoiceForPurchase, recalcInvoiceTotal } from "@/lib/invoices/invoiceService";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  color: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const existing = await prisma.creditCard.findFirst({ where: { id, householdId: session.householdId } });
  if (!existing) return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });

  const card = await prisma.creditCard.update({ where: { id }, data: parsed.data });

  // Se o dia de fechamento/vencimento mudou, as compras de faturas ainda não
  // pagas são redistribuídas para as faturas corretas (faturas pagas ficam como estão).
  const daysChanged =
    (parsed.data.closingDay !== undefined && parsed.data.closingDay !== existing.closingDay) ||
    (parsed.data.dueDay !== undefined && parsed.data.dueDay !== existing.dueDay);
  if (daysChanged) {
    const purchases = await prisma.transaction.findMany({
      where: { creditCardId: id, kind: TransactionKind.CARD_PURCHASE, OR: [{ invoiceId: null }, { invoice: { status: { notIn: ["PAID"] } } }] },
      select: { id: true, eventDate: true, invoiceId: true },
    });
    const touched = new Set<string>();
    // Atualiza datas das faturas não pagas existentes conforme os novos dias.
    const unpaid = await prisma.creditCardInvoice.findMany({ where: { creditCardId: id, status: { notIn: ["PAID"] } } });
    const { periodForReference } = await import("@/lib/invoices/invoicePeriod");
    for (const inv of unpaid) {
      const p = periodForReference(card, inv.referenceYear, inv.referenceMonth);
      await prisma.creditCardInvoice.update({ where: { id: inv.id }, data: { openingDate: p.openingDate, closingDate: p.closingDate, dueDate: p.dueDate } });
    }
    for (const t of purchases) {
      const invoiceId = await ensureInvoiceForPurchase(prisma, card, t.eventDate);
      if (invoiceId !== t.invoiceId) {
        await prisma.transaction.update({ where: { id: t.id }, data: { invoiceId } });
        if (t.invoiceId) touched.add(t.invoiceId);
        touched.add(invoiceId);
      }
    }
    for (const invId of touched) await recalcInvoiceTotal(prisma, invId);
  }

  return NextResponse.json(card);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.creditCard.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Cartão não encontrado." }, { status: 404 });

  await prisma.creditCard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
