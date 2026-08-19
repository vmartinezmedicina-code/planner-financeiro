import { prisma } from "@/lib/prisma";
import { InstallmentsBoard } from "@/components/installments/InstallmentsBoard";

export default async function ParcelamentosPage() {
  const purchases = await prisma.installmentPurchase.findMany({
    include: {
      category: true,
      creditCard: true,
      installments: { orderBy: { installmentNumber: "asc" } },
    },
    orderBy: { purchaseDate: "desc" },
  });

  const serialized = purchases.map((p) => ({
    id: p.id,
    description: p.description,
    totalAmount: p.totalAmount,
    installmentsCount: p.installmentsCount,
    purchaseDate: p.purchaseDate.toISOString(),
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    creditCard: { id: p.creditCard.id, name: p.creditCard.name },
    installments: p.installments.map((i) => ({
      id: i.id,
      eventDate: i.eventDate.toISOString(),
      amount: i.amount,
      installmentNumber: i.installmentNumber,
    })),
  }));

  return <InstallmentsBoard initial={serialized} />;
}
