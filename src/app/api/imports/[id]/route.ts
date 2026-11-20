import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { discardImport, getImportView, ImportError, updateImport } from "@/lib/imports/importService";
import { parseDateLoose } from "@/lib/imports/normalize";

const patchSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        include: z.boolean().optional(),
        description: z.string().max(200).optional(),
        categoryId: z.string().nullable().optional(),
        date: z.string().optional(),
        amountCents: z
          .number()
          .int()
          .refine((v) => v !== 0, "Valor não pode ser zero.")
          .optional(),
      })
    )
    .max(1000)
    .optional(),
  memberId: z.string().nullable().optional(),
  invoiceRef: z.object({ year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12) }).nullable().optional(),
  createFutureParcels: z.boolean().optional(),
});

function fail(e: unknown) {
  if (e instanceof ImportError) return NextResponse.json({ error: e.message }, { status: 400 });
  throw e;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await getImportView(id, session.householdId));
  } catch (e) {
    return fail(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  const d = parsed.data;
  try {
    const items = d.items?.map((it) => {
      const date = it.date !== undefined ? parseDateLoose(it.date) : undefined;
      if (it.date !== undefined && !date) throw new ImportError("Data inválida.");
      return { ...it, date: date ?? undefined };
    });
    await updateImport(id, session.householdId, { items, memberId: d.memberId, invoiceRef: d.invoiceRef, createFutureParcels: d.createFutureParcels });
    return NextResponse.json(await getImportView(id, session.householdId));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  try {
    await discardImport(id, session.householdId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
