import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ContributionSource } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";

const schema = z.object({
  amount: z.number().refine((v) => v !== 0, "Informe um valor."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.nativeEnum(ContributionSource).default(ContributionSource.MANUAL),
  note: z.string().max(200).nullable().optional(),
});

/**
 * Registra um aporte (valor positivo) ou retirada (negativo) numa meta. É só
 * um registro da meta: não cria lançamento nem mexe em saldo de conta. Metas
 * vinculadas a conta/investimento não aceitam aporte manual (o valor vem de lá).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  const goal = await prisma.financialGoal.findFirst({
    where: { id, householdId: session.householdId },
    select: { id: true, linkedBankId: true, linkedInvestmentId: true },
  });
  if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  if (goal.linkedBankId || goal.linkedInvestmentId) {
    return NextResponse.json({ error: "Esta meta acompanha o saldo de uma conta ou investimento; o valor vem de lá." }, { status: 400 });
  }

  const d = parsed.data;
  const c = await prisma.goalContribution.create({
    data: {
      goalId: goal.id,
      householdId: session.householdId,
      userId: session.userId,
      amountCents: toCents(d.amount),
      date: new Date(`${d.date}T00:00:00.000Z`),
      source: d.source,
      note: d.note || null,
    },
  });
  return NextResponse.json(c, { status: 201 });
}
