import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";

/** Contas da família com saldo atual (inicial + todos os lançamentos vinculados), em uma única agregação. */
export async function listBanksWithBalance(householdId: string) {
  const [banks, sums] = await Promise.all([
    prisma.bank.findMany({ where: { householdId }, orderBy: { order: "asc" } }),
    prisma.transaction.groupBy({ by: ["bankId"], where: { householdId, bankId: { not: null } }, _sum: { amountCents: true } }),
  ]);
  const sumByBank = new Map(sums.map((s) => [s.bankId, s._sum.amountCents ?? 0]));
  return banks.map((b) => {
    const currentBalanceCents = b.initialBalanceCents + (sumByBank.get(b.id) ?? 0);
    return {
      id: b.id,
      name: b.name,
      color: b.color,
      order: b.order,
      initialBalance: fromCents(b.initialBalanceCents),
      initialBalanceCents: b.initialBalanceCents,
      currentBalance: fromCents(currentBalanceCents),
      currentBalanceCents,
    };
  });
}

export type BankWithBalance = Awaited<ReturnType<typeof listBanksWithBalance>>[number];
