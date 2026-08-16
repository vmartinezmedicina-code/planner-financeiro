import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  updates: z.array(z.object({ id: z.string(), order: z.number().int() })).min(1),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  await prisma.$transaction(
    parsed.data.updates.map((u) => prisma.category.update({ where: { id: u.id }, data: { order: u.order } }))
  );

  return NextResponse.json({ ok: true });
}
