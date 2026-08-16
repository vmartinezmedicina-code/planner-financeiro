import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getPlanningData } from "@/lib/planning";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Parâmetros year/month inválidos." }, { status: 400 });
  }

  const data = await getPlanningData(year, month);
  return NextResponse.json(data);
}
