import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";
import { TransactionsBoard } from "@/components/transactions/TransactionsBoard";

export default async function LancamentosPage() {
  const [categories, banks, creditCards] = await Promise.all([
    getCategoryOptions(),
    prisma.bank.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.creditCard.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  const categoryPathById = Object.fromEntries(categories.map((c) => [c.id, c.label]));

  return (
    <TransactionsBoard
      categories={categories}
      banks={banks}
      creditCards={creditCards}
      categoryPathById={categoryPathById}
    />
  );
}
