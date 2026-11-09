import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus, PaymentMethod, TransactionKind, TransactionSource, Prisma } from "@prisma/client";
import { toCents, fromCents } from "@/lib/money";
import { createTransaction, TransactionError } from "@/lib/finance/transactionService";
import { assertMemberInHousehold, ScopeError } from "@/lib/household/householdService";

const createSchema = z.object({
  eventDate: z.string(),
  settlementDate: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  bankId: z.string().nullable().optional(),
  creditCardId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  description: z.string().min(1),
  // Compatibilidade: a tela ainda envia reais com sinal; amountCents tem precedência.
  amount: z.number().optional(),
  amountCents: z.number().int().optional(),
  kind: z.enum(["INCOME", "EXPENSE", "ADJUSTMENT"]).optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  isRecurring: z.boolean().optional(),
  source: z.nativeEnum(TransactionSource).optional(),
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
  const kind = searchParams.get("kind");
  const memberId = searchParams.get("memberId");
  const search = searchParams.get("search");
  const uncategorizedOnly = searchParams.get("uncategorized") === "1";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize")) || 20));

  const where: Prisma.TransactionWhereInput = { householdId: session.householdId };

  if (startDate || endDate) {
    where.eventDate = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + "T23:59:59.999Z") } : {}),
    };
  }
  if (bankId && bankId !== "Todas") where.bankId = bankId;
  if (creditCardId && creditCardId !== "Todos") where.creditCardId = creditCardId;
  if (status && status !== "Todos") where.status = status as TransactionStatus;
  if (kind && kind !== "Todos" && (Object.values(TransactionKind) as string[]).includes(kind)) where.kind = kind as TransactionKind;
  if (memberId && memberId !== "Todos") where.memberId = memberId;
  if (search) where.description = { contains: search };
  if (uncategorizedOnly) where.categoryId = null;

  const [items, total, aggregate, uncategorizedCount] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        category: true,
        bank: true,
        creditCardRef: true,
        member: { select: { id: true, name: true, color: true } },
        installmentPurchase: { select: { installmentsCount: true } },
      },
      orderBy: { eventDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
    prisma.transaction.aggregate({ where, _sum: { amountCents: true } }),
    prisma.transaction.count({ where: { ...where, categoryId: null } }),
  ]);

  return NextResponse.json({
    items,
    total,
    totalAmount: fromCents(aggregate._sum.amountCents ?? 0),
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
  const amountCents = d.amountCents ?? toCents(d.amount ?? 0);
  if (amountCents === 0) return NextResponse.json({ error: "Informe um valor diferente de zero." }, { status: 400 });

  try {
    const memberId = await assertMemberInHousehold(d.memberId, session.householdId);
    const transaction = await createTransaction({
      householdId: session.householdId,
      userId: session.userId,
      eventDate: new Date(d.eventDate),
      settlementDate: d.settlementDate ? new Date(d.settlementDate) : null,
      categoryId: d.categoryId || null,
      paymentMethod: d.paymentMethod ?? PaymentMethod.DEBITO,
      bankId: d.bankId || null,
      creditCardId: d.creditCardId || null,
      memberId,
      description: d.description,
      amountCents,
      kind: d.kind,
      status: d.status,
      isRecurring: d.isRecurring,
      source: d.source ?? TransactionSource.MANUAL,
    });
    return NextResponse.json(transaction, { status: 201 });
  } catch (e) {
    if (e instanceof TransactionError || e instanceof ScopeError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
