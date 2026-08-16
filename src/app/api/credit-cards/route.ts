import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const cards = await prisma.creditCard.findMany({ orderBy: { order: "asc" } });

  const withInvoice = await Promise.all(
    cards.map(async (card) => {
      // Fatura atual = todos os lançamentos do cartão, mesmo pendentes/não pagos.
      const transactions = await prisma.transaction.findMany({
        where: { creditCardId: card.id },
        include: { category: true },
      });
      const total = transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);

      const byCategory = new Map<string, number>();
      for (const t of transactions) {
        const label = t.category?.name ?? "Sem categoria";
        byCategory.set(label, (byCategory.get(label) ?? 0) + Math.abs(t.amount));
      }

      return {
        ...card,
        currentInvoice: total,
        transactionCount: transactions.length,
        byCategory: [...byCategory.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      };
    })
  );

  return NextResponse.json(withInvoice);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const count = await prisma.creditCard.count();
  const card = await prisma.creditCard.create({
    data: { ...parsed.data, order: count },
  });

  return NextResponse.json(card, { status: 201 });
}
