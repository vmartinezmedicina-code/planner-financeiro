import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listInvoices } from "@/lib/invoices/invoiceService";

/** Faturas da família. `?creditCardId=` filtra por cartão; `?limit=` limita. */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const creditCardId = searchParams.get("creditCardId") ?? undefined;
  const limit = Number(searchParams.get("limit")) || undefined;

  const invoices = await listInvoices(session.householdId, { creditCardId, limit });
  return NextResponse.json(invoices);
}
