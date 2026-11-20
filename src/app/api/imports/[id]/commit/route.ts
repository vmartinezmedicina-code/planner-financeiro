import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { TransactionError } from "@/lib/finance/transactionService";
import { commitImport, ImportError } from "@/lib/imports/importService";

export const maxDuration = 300;

/** Grava um lote de itens; o cliente chama de novo enquanto `remaining` > 0. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await commitImport(id, session.householdId, session.userId, 40));
  } catch (e) {
    if (e instanceof ImportError || e instanceof TransactionError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
