import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  product: z.string().min(1),
  institution: z.string().min(1),
  contributedAmount: z.number(),
  contributionDate: z.string(),
  currentValue: z.number(),
  notes: z.string().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const investments = await prisma.investment.findMany({
    include: { user: { select: { name: true } } },
    orderBy: { contributionDate: "desc" },
  });
  return NextResponse.json(investments);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const d = parsed.data;
  const investment = await prisma.investment.create({
    data: {
      product: d.product,
      institution: d.institution,
      contributedAmount: d.contributedAmount,
      contributionDate: new Date(d.contributionDate),
      currentValue: d.currentValue,
      notes: d.notes || null,
      userId: session.userId,
    },
  });

  return NextResponse.json(investment, { status: 201 });
}
