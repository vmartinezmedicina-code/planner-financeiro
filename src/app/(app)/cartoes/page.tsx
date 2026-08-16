import { prisma } from "@/lib/prisma";
import { CreditCardsBoard } from "@/components/creditcards/CreditCardsBoard";

export default async function CartoesPage() {
  const cards = await prisma.creditCard.findMany({ orderBy: { order: "asc" } });

  const withInvoice = await Promise.all(
    cards.map(async (card) => {
      const transactions = await prisma.transaction.findMany({
        where: { creditCardId: card.id },
        include: { category: true },
      });
      const total = transactions.reduce((acc, t) => acc + Math.abs(t.amount), 0);

      const byCategory = new Map<string, number>();
      for (const t of transactions) {
        const label = t.category?.name ?? "Sem categoria";
        byCategory.set(label, (byCategory.get(label) ?? 0) + Math.abs(t.amount));
      }

      return {
        ...card,
        currentInvoice: total,
        transactionCount: transactions.length,
        byCategory: [...byCategory.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      };
    })
  );

  return <CreditCardsBoard initial={withInvoice} />;
}
