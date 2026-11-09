import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recalcInvoiceTotal } from "@/lib/invoices/invoiceService";

// Exclui a compra parcelada inteira, junto com todas as parcelas (Transaction)
// ligadas a ela (onDelete: Cascade), e recalcula as faturas afetadas.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const purchase = await prisma.installmentPurchase.findFirst({
    where: { id, householdId: session.householdId },
    select: { id: true, installments: { select: { invoiceId: true } } },
  });
  if (!purchase) return NextResponse.json({ error: "Compra não encontrada." }, { status: 404 });

  const invoiceIds = [...new Set(purchase.installments.map((i) => i.invoiceId).filter((v): v is string => !!v))];
  await prisma.installmentPurchase.delete({ where: { id } });
  for (const invoiceId of invoiceIds) await recalcInvoiceTotal(prisma, invoiceId);

  return NextResponse.json({ ok: true });
}
