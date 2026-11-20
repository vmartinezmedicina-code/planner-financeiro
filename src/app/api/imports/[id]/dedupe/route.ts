import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ImportError, markRepeated } from "@/lib/imports/importService";

/** Depois de enviar todos os arquivos: marca itens repetidos entre eles. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ repeated: await markRepeated(id, session.householdId) });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
