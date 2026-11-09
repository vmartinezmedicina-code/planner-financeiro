import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { resolveUserScope } from "@/lib/household/householdService";
import { SESSION_COOKIE, SESSION_DURATION_SECONDS, signSession, verifySession, type SessionPayload } from "@/lib/sessionToken";

export { SESSION_COOKIE, signSession, verifySession };
export type { SessionPayload };

const SCOPE_CACHE_TTL_MS = 60_000;

/** Sessão resolvida: payload + escopo (família/membro) com versão validada. */
export type Session = SessionPayload & {
  householdId: string;
  memberId: string | null;
};

export async function setSessionCookie(payload: SessionPayload) {
  const token = signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// Cache em memória (por instância) do estado do usuário que a sessão precisa
// conferir a cada requisição: versão da sessão e escopo. Evita uma consulta ao
// banco por chamada; a janela de revogação é de no máximo SCOPE_CACHE_TTL_MS.
type ScopeEntry = { sessionVersion: number; householdId: string; memberId: string | null; expires: number };
const scopeCache = new Map<string, ScopeEntry>();

export function invalidateSessionCache(userId: string) {
  scopeCache.delete(userId);
}

async function loadScope(userId: string): Promise<ScopeEntry | null> {
  const cached = scopeCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  if (!user) return null;
  const scope = await resolveUserScope(userId);
  const entry: ScopeEntry = { sessionVersion: user.sessionVersion, ...scope, expires: Date.now() + SCOPE_CACHE_TTL_MS };
  scopeCache.set(userId, entry);
  return entry;
}

/**
 * Sessão completa e validada contra o banco: rejeita cookies emitidos antes
 * da última troca de senha (sessionVersion diferente) e anexa o escopo.
 */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySession(token);
  if (!payload) return null;

  const scope = await loadScope(payload.userId);
  if (!scope) return null;
  if ((payload.sv ?? 0) !== scope.sessionVersion) return null;

  return { ...payload, householdId: scope.householdId, memberId: scope.memberId };
}
