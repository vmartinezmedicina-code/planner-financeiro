import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { GoalStatus } from "@prisma/client";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { validateGoalLinks, GoalError } from "@/lib/goals/goalService";
import { goalInputSchema, parseTargetDate } from "@/lib/goals/goalInput";

const patchSchema = goalInputSchema.partial().extend({ status: z.nativeEnum(GoalStatus).optional() });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  // .partial() mantém os defaults do schema base; só aplicamos o que veio no corpo.
  const sent = new Set(Object.keys(raw ?? {}));
  const d = parsed.data;

  const goal = await prisma.financialGoal.findFirst({ where: { id, householdId: session.householdId } });
  if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });

  try {
    const bank = sent.has("linkedBankId") ? d.linkedBankId || null : goal.linkedBankId;
    const inv = sent.has("linkedInvestmentId") ? d.linkedInvestmentId || null : goal.linkedInvestmentId;
    await validateGoalLinks(session.householdId, bank, inv);
    const updated = await prisma.financialGoal.update({
      where: { id },
      data: {
        ...(sent.has("name") && d.name ? { name: d.name } : {}),
        ...(sent.has("description") ? { description: d.description || null } : {}),
        ...(sent.has("type") && d.type ? { type: d.type } : {}),
        ...(sent.has("strategy") && d.strategy ? { strategy: d.strategy } : {}),
        ...(sent.has("priority") && d.priority ? { priority: d.priority } : {}),
        ...(sent.has("status") && d.status ? { status: d.status } : {}),
        ...(sent.has("targetAmount") && d.targetAmount !== undefined ? { targetAmountCents: toCents(d.targetAmount) } : {}),
        ...(sent.has("initialAmount") && d.initialAmount !== undefined ? { initialAmountCents: toCents(d.initialAmount) } : {}),
        ...(sent.has("targetDate") ? { targetDate: parseTargetDate(d.targetDate) } : {}),
        ...(sent.has("monthlyPlan") ? { monthlyPlanCents: d.monthlyPlan ? toCents(d.monthlyPlan) : null } : {}),
        linkedBankId: bank,
        linkedInvestmentId: inv,
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof GoalError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const goal = await prisma.financialGoal.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!goal) return NextResponse.json({ error: "Meta não encontrada." }, { status: 404 });
  // Aportes são só registros da meta (não movem dinheiro); saem junto (cascade).
  await prisma.financialGoal.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
