import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Exclui a compra parcelada inteira, junto com todas as parcelas (Transaction)
// ligadas a ela — o onDelete: Cascade no schema cuida disso automaticamente.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  await prisma.installmentPurchase.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
