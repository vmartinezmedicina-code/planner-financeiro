import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const d = parsed.data;
  const investment = await prisma.investment.update({
    where: { id },
    data: {
      ...(d.product !== undefined ? { product: d.product } : {}),
      ...(d.institution !== undefined ? { institution: d.institution } : {}),
      ...(d.contributedAmount !== undefined ? { contributedAmount: d.contributedAmount } : {}),
      ...(d.contributionDate !== undefined ? { contributionDate: new Date(d.contributionDate) } : {}),
      ...(d.currentValue !== undefined ? { currentValue: d.currentValue } : {}),
      ...(d.notes !== undefined ? { notes: d.notes || null } : {}),
    },
  });

  return NextResponse.json(investment);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  await prisma.investment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
