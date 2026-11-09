import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { InstallmentsBoard } from "@/components/installments/InstallmentsBoard";

export default async function ParcelamentosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const purchases = await prisma.installmentPurchase.findMany({
    where: { householdId: session.householdId },
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
    totalAmount: fromCents(p.totalAmountCents),
    installmentsCount: p.installmentsCount,
    purchaseDate: p.purchaseDate.toISOString(),
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    creditCard: { id: p.creditCard.id, name: p.creditCard.name },
    installments: p.installments.map((i) => ({
      id: i.id,
      eventDate: i.eventDate.toISOString(),
      amount: fromCents(i.amountCents),
      installmentNumber: i.installmentNumber,
    })),
  }));

  return <InstallmentsBoard initial={serialized} />;
}
