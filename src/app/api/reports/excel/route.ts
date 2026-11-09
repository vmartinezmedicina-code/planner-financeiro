import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPlanningData, CategoryNode } from "@/lib/planning";
import { MONTH_NAMES } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/paymentMethod";
import { KIND_LABEL, type TransactionKindValue } from "@/lib/finance/kinds";
import { fromCents } from "@/lib/money";

export const runtime = "nodejs";

const MONEY = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

function flatten(nodes: CategoryNode[], depth = 0, out: { name: string; planned: number; realized: number }[] = []) {
  for (const n of nodes) {
    out.push({ name: `${"   ".repeat(depth)}${n.name}`, planned: n.plannedTotal, realized: n.realizedTotal });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Parâmetros year/month inválidos." }, { status: 400 });
  }

  const planning = await getPlanningData(session.householdId, year, month);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  const transactions = await prisma.transaction.findMany({
    where: { householdId: session.householdId, eventDate: { gte: start, lt: end } },
    include: { category: true, bank: true, creditCardRef: true, member: { select: { name: true } } },
    orderBy: { eventDate: "asc" },
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Planner Financeiro";

  // --- Resumo ---
  const resumo = wb.addWorksheet("Resumo");
  resumo.columns = [
    { header: `${MONTH_NAMES[month - 1]} de ${year}`, key: "k", width: 28 },
    { header: "Planejado", key: "p", width: 18 },
    { header: "Realizado", key: "r", width: 18 },
  ];
  styleHeader(resumo.getRow(1));
  const s = planning.summary;
  resumo.addRow({ k: "Receitas", p: s.totalReceitaPlanned, r: s.totalReceitaRealized });
  resumo.addRow({ k: "Despesas", p: s.totalDespesaPlanned, r: s.totalDespesaRealized });
  const saldo = resumo.addRow({ k: "Saldo", p: s.plannedBalance, r: s.realizedBalance });
  saldo.font = { bold: true };
  resumo.getColumn("p").numFmt = MONEY;
  resumo.getColumn("r").numFmt = MONEY;

  // --- Categorias ---
  const cat = wb.addWorksheet("Categorias");
  cat.columns = [
    { header: "Categoria", key: "name", width: 40 },
    { header: "Planejado", key: "planned", width: 18 },
    { header: "Realizado", key: "realized", width: 18 },
    { header: "Diferença", key: "diff", width: 18 },
  ];
  styleHeader(cat.getRow(1));
  const addBlock = (title: string, roots: CategoryNode[]) => {
    const t = cat.addRow({ name: title });
    t.font = { bold: true };
    for (const r of flatten(roots)) {
      cat.addRow({ name: r.name, planned: r.planned, realized: r.realized, diff: r.planned - r.realized });
    }
  };
  addBlock("RECEITAS", planning.receitaRoots);
  addBlock("DESPESAS", planning.despesaRoots);
  for (const key of ["planned", "realized", "diff"]) cat.getColumn(key).numFmt = MONEY;

  // --- Lançamentos ---
  const lan = wb.addWorksheet("Lançamentos");
  lan.columns = [
    { header: "Data", key: "date", width: 12 },
    { header: "Descrição", key: "desc", width: 36 },
    { header: "Categoria", key: "cat", width: 28 },
    { header: "Tipo", key: "kind", width: 18 },
    { header: "Forma", key: "pay", width: 12 },
    { header: "Membro", key: "member", width: 16 },
    { header: "Banco / Cartão", key: "where", width: 20 },
    { header: "Valor", key: "amount", width: 16 },
    { header: "Status", key: "status", width: 12 },
  ];
  styleHeader(lan.getRow(1));
  for (const t of transactions) {
    lan.addRow({
      date: t.eventDate,
      desc: t.description,
      cat: t.category?.name ?? "Sem categoria",
      kind: KIND_LABEL[t.kind as TransactionKindValue],
      pay: PAYMENT_METHOD_LABEL[t.paymentMethod],
      member: t.member?.name ?? "",
      where: t.bank?.name ?? t.creditCardRef?.name ?? "",
      amount: fromCents(t.amountCents),
      status: t.status,
    });
  }
  lan.getColumn("date").numFmt = "dd/mm/yyyy";
  lan.getColumn("amount").numFmt = MONEY;

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-${year}-${String(month).padStart(2, "0")}.xlsx"`,
    },
  });
}
