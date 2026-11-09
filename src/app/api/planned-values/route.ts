import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents, fromCents } from "@/lib/money";

const schema = z.object({
  categoryId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amount: z.number().optional(),
  amountCents: z.number().int().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { categoryId, year, month } = parsed.data;
  const cents = parsed.data.amountCents ?? toCents(parsed.data.amount ?? 0);

  const category = await prisma.category.findFirst({ where: { id: categoryId, householdId: session.householdId }, select: { id: true } });
  if (!category) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });

  const value = await prisma.plannedValue.upsert({
    where: { categoryId_year_month: { categoryId, year, month } },
    update: { amount: fromCents(cents), amountCents: cents, userId: session.userId, householdId: session.householdId },
    create: { categoryId, year, month, amount: fromCents(cents), amountCents: cents, userId: session.userId, householdId: session.householdId },
  });

  return NextResponse.json(value);
}
