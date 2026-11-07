import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z
    .string()
    .min(10, "A nova senha precisa ter ao menos 10 caracteres.")
    .max(100, "Senha muito longa."),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return NextResponse.json({ error: "Conta bloqueada temporariamente. Tente mais tarde." }, { status: 429 });
  }

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data:
        failed >= 5
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + 15 * 60000) }
          : { failedLogins: failed },
    });
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }

  if (currentPassword === newPassword) {
    return NextResponse.json({ error: "A nova senha precisa ser diferente da atual." }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12), failedLogins: 0, lockedUntil: null },
  });

  return NextResponse.json({ ok: true });
}
