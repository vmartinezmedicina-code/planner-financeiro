import { prisma } from "@/lib/prisma";
import { BanksBoard } from "@/components/banks/BanksBoard";

export default async function BancosPage() {
  const banks = await prisma.bank.findMany({ orderBy: { order: "asc" } });

  const withBalance = await Promise.all(
    banks.map(async (b) => {
      const agg = await prisma.transaction.aggregate({ where: { bankId: b.id }, _sum: { amount: true } });
      return { ...b, currentBalance: b.initialBalance + (agg._sum.amount ?? 0) };
    })
  );

  return <BanksBoard initial={withBalance} />;
}
