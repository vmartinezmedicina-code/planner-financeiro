import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@prisma/client";

const updateSchema = z.object({
  eventDate: z.string().optional(),
  settlementDate: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  bankInstitution: z.string().nullable().optional(),
  creditCard: z.string().nullable().optional(),
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
  const transaction = await prisma.transaction.update({
    where: { id },
    data: {
      ...(d.eventDate ? { eventDate: new Date(d.eventDate) } : {}),
      ...(d.settlementDate !== undefined ? { settlementDate: d.settlementDate ? new Date(d.settlementDate) : null } : {}),
      ...(d.categoryId !== undefined ? { categoryId: d.categoryId || null } : {}),
      ...(d.bankInstitution !== undefined ? { bankInstitution: d.bankInstitution || null } : {}),
      ...(d.creditCard !== undefined ? { creditCard: d.creditCard || null } : {}),
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
