import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id, cid } = await params;
  const res = await prisma.goalContribution.deleteMany({ where: { id: cid, goalId: id, householdId: session.householdId } });
  if (res.count === 0) return NextResponse.json({ error: "Aporte não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
