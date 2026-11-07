import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@prisma/client";

const schema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

// Gera, para o mês informado, uma cópia de cada lançamento recorrente do mês
// anterior. Não duplica: se já existir no mês um lançamento igual (mesma
// descrição, valor, categoria e banco/cartão), ele é pulado — então é seguro
// clicar mais de uma vez. Parcelas de compras parceladas nunca são copiadas.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { year, month } = parsed.data;
  const targetStart = new Date(Date.UTC(year, month - 1, 1));
  const targetEnd = new Date(Date.UTC(year, month, 1));
  const prevStart = new Date(Date.UTC(year, month - 2, 1));

  const [source, existing] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        isRecurring: true,
        installmentPurchaseId: null,
        eventDate: { gte: prevStart, lt: targetStart },
      },
    }),
    prisma.transaction.findMany({
      where: { eventDate: { gte: targetStart, lt: targetEnd } },
      select: { description: true, amount: true, categoryId: true, bankId: true, creditCardId: true },
    }),
  ]);

  const key = (t: { description: string; amount: number; categoryId: string | null; bankId: string | null; creditCardId: string | null }) =>
    [t.description, t.amount, t.categoryId ?? "", t.bankId ?? "", t.creditCardId ?? ""].join("|");
  const existingKeys = new Set(existing.map(key));

  const daysInTarget = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let created = 0;

  for (const t of source) {
    if (existingKeys.has(key(t))) continue;
    const day = Math.min(t.eventDate.getUTCDate(), daysInTarget);
    await prisma.transaction.create({
      data: {
        eventDate: new Date(Date.UTC(year, month - 1, day)),
        settlementDate: null,
        categoryId: t.categoryId,
        paymentMethod: t.paymentMethod,
        bankId: t.bankId,
        creditCardId: t.creditCardId,
        description: t.description,
        amount: t.amount,
        status: TransactionStatus.PENDENTE,
        isRecurring: true,
        userId: session.userId,
      },
    });
    existingKeys.add(key(t));
    created++;
  }

  return NextResponse.json({ created, skipped: source.length - created });
}
