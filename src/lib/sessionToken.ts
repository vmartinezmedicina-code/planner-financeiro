import jwt from "jsonwebtoken";

// Parte da sessão que NÃO depende do banco (usada também pelo proxy, que
// não deve carregar o Prisma). A validação completa fica em auth.ts.

export const SESSION_COOKIE = "planner_session";
export const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30; // 30 dias

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET não configurado no .env");
  }
  return secret;
}

/** Conteúdo assinado no cookie. `sv` = sessionVersion do usuário no momento do login. */
export type SessionPayload = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  sv?: number;
};

export function signSession(payload: SessionPayload) {
  return jwt.sign(payload, getSecret(), { expiresIn: SESSION_DURATION_SECONDS });
}

/** Só valida assinatura/expiração. */
export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSecret()) as SessionPayload;
  } catch {
    return null;
  }
}
