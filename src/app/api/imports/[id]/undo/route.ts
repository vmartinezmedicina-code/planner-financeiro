import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ImportError, undoImport } from "@/lib/imports/importService";

export const maxDuration = 120;

/** Remove os lançamentos criados pela importação e volta para a conferência. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await undoImport(id, session.householdId));
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
