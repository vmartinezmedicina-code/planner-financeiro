import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { todayAsUtcDate } from "@/lib/format";

/**
 * Contas da família com saldo.
 *
 * - `currentBalanceCents`: saldo REAL na data `asOf` (padrão: hoje) = saldo
 *   inicial + lançamentos cuja data de caixa já chegou. Data de caixa é a
 *   data de efetivação quando informada; senão, a data do evento.
 * - `scheduledCents`: soma dos lançamentos com data futura (já lançados, mas
 *   que ainda não mexeram no dinheiro). Saldo previsto = atual + agendado.
 *
 * `asOf: null` ignora datas e soma tudo (comportamento da V1; usado em testes).
 */
export async function listBanksWithBalance(householdId: string, opts: { asOf?: Date | null } = {}) {
  const asOf = opts.asOf === undefined ? todayAsUtcDate() : opts.asOf;
  const base = { householdId, bankId: { not: null } } as const;

  const banksPromise = prisma.bank.findMany({ where: { householdId }, orderBy: { order: "asc" } });
  const allPromise = prisma.transaction.groupBy({ by: ["bankId"], where: base, _sum: { amountCents: true } });

  let realized: Map<string | null, number>;
  const [banks, all] = await Promise.all([banksPromise, allPromise]);
  const allByBank = new Map(all.map((s) => [s.bankId, s._sum.amountCents ?? 0]));

  if (asOf === null) {
    realized = allByBank;
  } else {
    const end = new Date(asOf.getTime() + 86400000); // exclusivo: inclui o dia de hoje inteiro
    const [settled, byEvent] = await Promise.all([
      prisma.transaction.groupBy({ by: ["bankId"], where: { ...base, settlementDate: { lt: end } }, _sum: { amountCents: true } }),
      prisma.transaction.groupBy({ by: ["bankId"], where: { ...base, settlementDate: null, eventDate: { lt: end } }, _sum: { amountCents: true } }),
    ]);
    realized = new Map<string | null, number>();
    for (const s of [...settled, ...byEvent]) realized.set(s.bankId, (realized.get(s.bankId) ?? 0) + (s._sum.amountCents ?? 0));
  }

  return banks.map((b) => {
    const movedCents = realized.get(b.id) ?? 0;
    const currentBalanceCents = b.initialBalanceCents + movedCents;
    const scheduledCents = (allByBank.get(b.id) ?? 0) - movedCents;
    return {
      id: b.id,
      name: b.name,
      color: b.color,
      order: b.order,
      initialBalance: fromCents(b.initialBalanceCents),
      initialBalanceCents: b.initialBalanceCents,
      currentBalance: fromCents(currentBalanceCents),
      currentBalanceCents,
      scheduledCents,
    };
  });
}

export type BankWithBalance = Awaited<ReturnType<typeof listBanksWithBalance>>[number];
