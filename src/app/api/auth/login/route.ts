import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { setSessionCookie } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Hash falso usado para gastar o mesmo tempo quando o e-mail não existe.
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente", 12);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });

  if (user?.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Muitas tentativas. Tente novamente em ${mins} minuto(s).` },
      { status: 429 }
    );
  }

  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !valid) {
    if (user) {
      // Se o bloqueio anterior já expirou, a contagem recomeça.
      const base = user.lockedUntil ? 0 : user.failedLogins;
      const failed = base + 1;
      await prisma.user.update({
        where: { id: user.id },
        data:
          failed >= MAX_ATTEMPTS
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) }
            : { failedLogins: failed, lockedUntil: null },
      });
    }
    return NextResponse.json({ error: "E-mail ou senha incorretos." }, { status: 401 });
  }

  if (user.failedLogins > 0 || user.lockedUntil) {
    await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } });
  }

  await setSessionCookie({
    userId: user.id,
    name: user.name,
    email: user.email,
    avatarColor: user.avatarColor,
  });

  return NextResponse.json({ ok: true });
}
