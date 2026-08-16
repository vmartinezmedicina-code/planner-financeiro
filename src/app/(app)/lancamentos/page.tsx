import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";
import { TransactionsBoard } from "@/components/transactions/TransactionsBoard";

export default async function LancamentosPage() {
  const [categories, bankRows] = await Promise.all([
    getCategoryOptions(),
    prisma.transaction.findMany({
      distinct: ["bankInstitution"],
      select: { bankInstitution: true },
      where: { bankInstitution: { not: null } },
    }),
  ]);

  const banks = bankRows.map((b) => b.bankInstitution!).filter(Boolean).sort();
  const categoryPathById = Object.fromEntries(categories.map((c) => [c.id, c.label]));

  return <TransactionsBoard categories={categories} banks={banks} categoryPathById={categoryPathById} />;
}
