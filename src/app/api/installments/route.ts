import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, PaymentMethod } from "@prisma/client";

const createSchema = z.object({
  description: z.string().min(1),
  totalAmount: z.number().positive(),
  installmentsCount: z.number().int().min(2).max(60),
  purchaseDate: z.string(), // data da 1ª parcela (data da compra)
  categoryId: z.string().nullable().optional(),
  creditCardId: z.string().min(1),
});

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  // Corrige overflow de dia (ex: 31/jan + 1 mês vira 3/mar sem este ajuste)
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  return d;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const purchases = await prisma.installmentPurchase.findMany({
    include: {
      category: true,
      creditCard: true,
      installments: { orderBy: { installmentNumber: "asc" } },
    },
    orderBy: { purchaseDate: "desc" },
  });

  return NextResponse.json(purchases);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const d = parsed.data;
  const purchaseDate = new Date(d.purchaseDate);

  // Divide o valor total em N parcelas iguais; a diferença de arredondamento
  // (centavos) fica toda na última parcela, para o somatório bater exato.
  const baseInstallment = Math.floor((d.totalAmount / d.installmentsCount) * 100) / 100;
  const roundedSum = Math.round(baseInstallment * (d.installmentsCount - 1) * 100) / 100;
  const lastInstallment = Math.round((d.totalAmount - roundedSum) * 100) / 100;

  const purchase = await prisma.installmentPurchase.create({
    data: {
      description: d.description,
      totalAmount: d.totalAmount,
      installmentsCount: d.installmentsCount,
      purchaseDate,
      categoryId: d.categoryId || null,
      creditCardId: d.creditCardId,
      userId: session.userId,
      installments: {
        create: Array.from({ length: d.installmentsCount }, (_, i) => {
          const isLast = i === d.installmentsCount - 1;
          const amount = isLast ? lastInstallment : baseInstallment;
          return {
            eventDate: addMonths(purchaseDate, i),
            categoryId: d.categoryId || null,
            paymentMethod: PaymentMethod.CREDITO,
            creditCardId: d.creditCardId,
            description: `${d.description} (${i + 1}/${d.installmentsCount})`,
            amount: -amount,
            status: TransactionStatus.PENDENTE,
            installmentNumber: i + 1,
            userId: session.userId,
          };
        }),
      },
    },
    include: { installments: true },
  });

  return NextResponse.json(purchase, { status: 201 });
}
