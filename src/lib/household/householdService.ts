import { prisma } from "@/lib/prisma";

export const DEFAULT_HOUSEHOLD_ID = "hh_default";

/**
 * Garante que a família padrão existe e devolve seu id. O sistema hoje tem
 * uma única família; este é o único lugar que conhece o id fixo.
 */
export async function ensureDefaultHousehold(): Promise<string> {
  await prisma.household.upsert({
    where: { id: DEFAULT_HOUSEHOLD_ID },
    update: {},
    create: { id: DEFAULT_HOUSEHOLD_ID, name: "Família" },
  });
  return DEFAULT_HOUSEHOLD_ID;
}

/**
 * Resolve família e membro de um usuário, criando o que faltar (usuários
 * antigos sem vínculo). Usado pela sessão.
 */
export async function resolveUserScope(userId: string): Promise<{ householdId: string; memberId: string | null }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarColor: true, householdId: true, member: { select: { id: true } } },
  });
  if (!user) throw new Error("Usuário não encontrado.");

  let householdId = user.householdId;
  if (!householdId) {
    householdId = await ensureDefaultHousehold();
    await prisma.user.update({ where: { id: userId }, data: { householdId } });
  }

  let memberId = user.member?.id ?? null;
  if (!memberId) {
    const member = await prisma.householdMember.create({
      data: { id: `mem_${userId}`, householdId, name: user.name, userId, color: user.avatarColor },
    });
    memberId = member.id;
  }

  return { householdId, memberId };
}

export async function listMembers(householdId: string) {
  return prisma.householdMember.findMany({
    where: { householdId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, color: true, order: true, isActive: true, userId: true },
  });
}

/** Confere que um membro pertence à família (para não aceitar ids de outra). */
export async function assertMemberInHousehold(memberId: string | null | undefined, householdId: string): Promise<string | null> {
  if (!memberId) return null;
  const m = await prisma.householdMember.findFirst({ where: { id: memberId, householdId }, select: { id: true } });
  if (!m) throw new ScopeError("Membro não pertence a esta família.");
  return m.id;
}

export class ScopeError extends Error {}
