import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents, fromCents } from "@/lib/money";

const updateSchema = z.object({
  product: z.string().min(1).optional(),
  institution: z.string().min(1).optional(),
  contributedAmount: z.number().optional(),
  contributionDate: z.string().optional(),
  currentValue: z.number().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const existing = await prisma.investment.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Investimento não encontrado." }, { status: 404 });

  const d = parsed.data;
  const contributedCents = d.contributedAmount !== undefined ? toCents(d.contributedAmount) : undefined;
  const currentCents = d.currentValue !== undefined ? toCents(d.currentValue) : undefined;
  const investment = await prisma.investment.update({
    where: { id },
    data: {
      ...(d.product !== undefined ? { product: d.product } : {}),
      ...(d.institution !== undefined ? { institution: d.institution } : {}),
      ...(contributedCents !== undefined ? { contributedAmount: fromCents(contributedCents), contributedAmountCents: contributedCents } : {}),
      ...(d.contributionDate !== undefined ? { contributionDate: new Date(d.contributionDate) } : {}),
      ...(currentCents !== undefined ? { currentValue: fromCents(currentCents), currentValueCents: currentCents } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });

  return NextResponse.json(investment);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.investment.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Investimento não encontrado." }, { status: 404 });

  await prisma.investment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
