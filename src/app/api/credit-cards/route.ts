import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCardsWithInvoices } from "@/lib/invoices/cards";

const createSchema = z.object({
  name: z.string().min(1),
  institution: z.string().nullable().optional(),
  limit: z.number().nullable().optional(),
  closingDay: z.number().int().min(1).max(31).nullable().optional(),
  dueDay: z.number().int().min(1).max(31).nullable().optional(),
  color: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await listCardsWithInvoices(session.householdId));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const count = await prisma.creditCard.count({ where: { householdId: session.householdId } });
  const card = await prisma.creditCard.create({
    data: { ...parsed.data, order: count, householdId: session.householdId },
  });

  return NextResponse.json(card, { status: 201 });
}
