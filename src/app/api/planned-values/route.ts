import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  categoryId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  amount: z.number(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { categoryId, year, month, amount } = parsed.data;

  const value = await prisma.plannedValue.upsert({
    where: { categoryId_year_month: { categoryId, year, month } },
    update: { amount, userId: session.userId },
    create: { categoryId, year, month, amount, userId: session.userId },
  });

  return NextResponse.json(value);
}
