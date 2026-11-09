import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listMembers } from "@/lib/household/householdService";

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  return NextResponse.json(await listMembers(session.householdId));
}

/** Cria um membro financeiro sem login (ex.: "Helena", "Casa"). */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const count = await prisma.householdMember.count({ where: { householdId: session.householdId } });
  const member = await prisma.householdMember.create({
    data: { householdId: session.householdId, name: parsed.data.name.trim(), color: parsed.data.color, order: count },
  });
  return NextResponse.json(member, { status: 201 });
}
