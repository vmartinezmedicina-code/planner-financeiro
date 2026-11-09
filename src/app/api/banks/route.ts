import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents, fromCents } from "@/lib/money";
import { listBanksWithBalance } from "@/lib/finance/banks";

const createSchema = z.object({
  name: z.string().min(1),
  initialBalance: z.number().optional(),
  initialBalanceCents: z.number().int().optional(),
  color: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await listBanksWithBalance(session.householdId));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const cents = parsed.data.initialBalanceCents ?? toCents(parsed.data.initialBalance ?? 0);
  const count = await prisma.bank.count({ where: { householdId: session.householdId } });
  const bank = await prisma.bank.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color,
      initialBalance: fromCents(cents),
      initialBalanceCents: cents,
      order: count,
      householdId: session.householdId,
    },
  });

  return NextResponse.json(bank, { status: 201 });
}
