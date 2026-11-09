import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toCents, fromCents } from "@/lib/money";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  initialBalance: z.number().optional(),
  initialBalanceCents: z.number().int().optional(),
  color: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const existing = await prisma.bank.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  const d = parsed.data;
  const cents = d.initialBalanceCents !== undefined ? d.initialBalanceCents : d.initialBalance !== undefined ? toCents(d.initialBalance) : undefined;
  const bank = await prisma.bank.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.color !== undefined ? { color: d.color } : {}),
      ...(cents !== undefined ? { initialBalance: fromCents(cents), initialBalanceCents: cents } : {}),
    },
  });
  return NextResponse.json(bank);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.bank.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });

  await prisma.bank.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
