import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { createImportSession, ImportError, listImports } from "@/lib/imports/importService";

const createSchema = z.object({
  target: z.enum(["CARD", "BANK"]),
  creditCardId: z.string().nullable().optional(),
  bankId: z.string().nullable().optional(),
  memberId: z.string().nullable().optional(),
  invoiceRef: z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).nullable().optional(),
  createFutureParcels: z.boolean().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await listImports(session.householdId));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  try {
    const s = await createImportSession({ ...parsed.data, householdId: session.householdId, userId: session.userId });
    return NextResponse.json({ id: s.id }, { status: 201 });
  } catch (e) {
    if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
