import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().optional(),
  isActive: z.boolean().optional(),
  order: z.number().int().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const existing = await prisma.householdMember.findFirst({ where: { id, householdId: session.householdId }, select: { id: true } });
  if (!existing) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });

  const member = await prisma.householdMember.update({
    where: { id },
    data: { ...parsed.data, ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}) },
  });
  return NextResponse.json(member);
}

/**
 * Remove um membro sem login. Membros com login não podem ser removidos
 * (desative-os). Lançamentos ligados ficam sem membro (SET NULL).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.householdMember.findFirst({ where: { id, householdId: session.householdId }, select: { id: true, userId: true } });
  if (!existing) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });
  if (existing.userId) return NextResponse.json({ error: "Membros com login não podem ser removidos; desative-os." }, { status: 400 });

  await prisma.householdMember.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
