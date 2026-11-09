import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { getCategoryAnalysis } from "@/lib/analytics/categoryAnalytics";

const querySchema = z.object({
  type: z.enum(["RECEITA", "DESPESA"]),
  categoryId: z.string().min(1).max(100).nullable(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * Drill-down de categoria: `?type=DESPESA&year=2026&month=11` devolve o
 * primeiro nível; com `&categoryId=...` devolve aquele nó (qualquer
 * profundidade). `categoryId=__none__` = lançamentos sem categoria.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    type: searchParams.get("type"),
    categoryId: searchParams.get("categoryId") || null,
    year: searchParams.get("year"),
    month: searchParams.get("month"),
  });
  if (!parsed.success) return NextResponse.json({ error: "Parâmetros inválidos." }, { status: 400 });

  const data = await getCategoryAnalysis(session.householdId, parsed.data);
  if (!data) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
  return NextResponse.json(data);
}
