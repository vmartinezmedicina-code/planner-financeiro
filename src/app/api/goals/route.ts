import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { listGoals, validateGoalLinks, GoalError } from "@/lib/goals/goalService";
import { goalInputSchema, parseTargetDate } from "@/lib/goals/goalInput";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await listGoals(session.householdId));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = goalInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const d = parsed.data;

  try {
    await validateGoalLinks(session.householdId, d.linkedBankId, d.linkedInvestmentId);
    const goal = await prisma.financialGoal.create({
      data: {
        householdId: session.householdId,
        userId: session.userId,
        name: d.name,
        description: d.description || null,
        type: d.type,
        strategy: d.strategy,
        priority: d.priority,
        targetAmountCents: toCents(d.targetAmount),
        // com vínculo, o valor atual vem da conta/investimento: o "já reservado" não soma
        initialAmountCents: d.linkedBankId || d.linkedInvestmentId ? 0 : toCents(d.initialAmount),
        targetDate: parseTargetDate(d.targetDate),
        monthlyPlanCents: d.monthlyPlan ? toCents(d.monthlyPlan) : null,
        linkedBankId: d.linkedBankId || null,
        linkedInvestmentId: d.linkedInvestmentId || null,
      },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (e) {
    if (e instanceof GoalError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
