import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, PaymentMethod } from "@prisma/client";
import { resolvePaymentLinks } from "@/lib/paymentMethod";

const createSchema = z.object({
  eventDate: z.string(),
  settlementDate: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  bankId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  description: z.string().min(1),
  amount: z.number(),
  status: z.nativeEnum(TransactionStatus).optional(),
  isRecurring: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const bankId = searchParams.get("bankId");
  const creditCardId = searchParams.get("creditCardId");
  const status = searchParams.get("status");
  const search = searchParams.get("search");
  const uncategorizedOnly = searchParams.get("uncategorized") === "1";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const where: Record<string, unknown> = {};

  if (startDate || endDate) {
    where.eventDate = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + "T23:59:59.999Z") } : {}),
    };
  }
  if (bankId && bankId !== "Todas") where.bankId = bankId;
  if (creditCardId && creditCardId !== "Todos") where.creditCardId = creditCardId;
  if (status && status !== "Todos") where.status = status;
  if (search) where.description = { contains: search };
  if (uncategorizedOnly) where.categoryId = null;

  const [items, total, aggregate, uncategorizedCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: true,
        bank: true,
        creditCardRef: true,
        installmentPurchase: { select: { installmentsCount: true } },
      },
      orderBy: { eventDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amount: true } }),
    prisma.transaction.count({ where: { ...where, categoryId: null } }),
  ]);

  return NextResponse.json({
    items,
    total,
    totalAmount: aggregate._sum.amount ?? 0,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    uncategorizedCount,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const d = parsed.data;
  const paymentMethod = d.paymentMethod ?? PaymentMethod.DEBITO;
  const { bankId, creditCardId } = resolvePaymentLinks(paymentMethod, d.bankId || null, d.creditCardId || null);

  const transaction = await prisma.transaction.create({
    data: {
      eventDate: new Date(d.eventDate),
      settlementDate: d.settlementDate ? new Date(d.settlementDate) : null,
      categoryId: d.categoryId || null,
      paymentMethod,
      bankId,
      creditCardId,
      description: d.description,
      amount: d.amount,
      status: d.status ?? TransactionStatus.PENDENTE,
      isRecurring: d.isRecurring ?? false,
      userId: session.userId,
    },
  });

  return NextResponse.json(transaction, { status: 201 });
}
