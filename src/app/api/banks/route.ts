import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  name: z.string().min(1),
  initialBalance: z.number(),
  color: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const banks = await prisma.bank.findMany({ orderBy: { order: "asc" } });

  const balances = await Promise.all(
    banks.map(async (b) => {
      const agg = await prisma.transaction.aggregate({
        where: { bankId: b.id },
        _sum: { amount: true },
      });
      return { ...b, currentBalance: b.initialBalance + (agg._sum.amount ?? 0) };
    })
  );

  return NextResponse.json(balances);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const count = await prisma.bank.count();
  const bank = await prisma.bank.create({
    data: { ...parsed.data, order: count },
  });

  return NextResponse.json(bank, { status: 201 });
}
