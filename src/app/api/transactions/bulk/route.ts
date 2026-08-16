import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TransactionStatus } from "@prisma/client";

const schema = z.object({
  ids: z.array(z.string()).min(1),
  action: z.enum(["delete", "categorize", "status", "recurring"]),
  categoryId: z.string().nullable().optional(),
  status: z.nativeEnum(TransactionStatus).optional(),
  isRecurring: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  const { ids, action } = parsed.data;

  if (action === "delete") {
    await prisma.transaction.deleteMany({ where: { id: { in: ids } } });
  } else if (action === "categorize") {
    await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { categoryId: parsed.data.categoryId || null } });
  } else if (action === "status" && parsed.data.status) {
    await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { status: parsed.data.status } });
  } else if (action === "recurring") {
    await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { isRecurring: parsed.data.isRecurring ?? true } });
  }

  return NextResponse.json({ ok: true });
}
