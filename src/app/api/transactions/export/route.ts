import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";

function csvEscape(value: string) {
  if (/[",\n;]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const where: Record<string, unknown> = {};
  if (startDate || endDate) {
    where.eventDate = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(endDate + "T23:59:59.999Z") } : {}),
    };
  }

  const [items, categories] = await Promise.all([
    prisma.transaction.findMany({ where, orderBy: { eventDate: "desc" }, include: { bank: true, creditCardRef: true } }),
    getCategoryOptions(),
  ]);
  const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));

  const header = [
    "Data do evento",
    "Data da efetivação",
    "Categoria",
    "Instituição Financeira",
    "Cartão de Crédito",
    "Descrição",
    "Valor",
    "Status",
    "Recorrente",
  ];

  const rows = items.map((t) => [
    t.eventDate.toISOString().slice(0, 10),
    t.settlementDate ? t.settlementDate.toISOString().slice(0, 10) : "",
    t.categoryId ? categoryLabel.get(t.categoryId) ?? "" : "",
    t.bank?.name ?? "",
    t.creditCardRef?.name ?? "",
    t.description,
    t.amount.toString().replace(".", ","),
    t.status,
    t.isRecurring ? "Sim" : "Não",
  ]);

  const csv = [header, ...rows].map((r) => r.map((c) => csvEscape(String(c))).join(";")).join("\n");
  const bom = "﻿";

  return new NextResponse(bom + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lancamentos.csv"`,
    },
  });
}
