import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CategoryType } from "@prisma/client";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.nativeEnum(CategoryType),
  parentId: z.string().nullable().optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const categories = await prisma.category.findMany({ where: { householdId: session.householdId }, orderBy: { order: "asc" } });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { name, type, parentId } = parsed.data;

  if (parentId) {
    const parent = await prisma.category.findFirst({ where: { id: parentId, householdId: session.householdId }, select: { id: true } });
    if (!parent) return NextResponse.json({ error: "Categoria pai não encontrada." }, { status: 404 });
  }

  const siblingsCount = await prisma.category.count({ where: { householdId: session.householdId, parentId: parentId ?? null } });

  const category = await prisma.category.create({
    data: { name, type, parentId: parentId ?? null, order: siblingsCount, householdId: session.householdId },
  });

  return NextResponse.json(category, { status: 201 });
}
