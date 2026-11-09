import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listCardsWithInvoices } from "@/lib/invoices/cards";
import { CreditCardsBoard } from "@/components/creditcards/CreditCardsBoard";

export default async function CartoesPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [cards, banks] = await Promise.all([
    listCardsWithInvoices(session.householdId),
    prisma.bank.findMany({ where: { householdId: session.householdId }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
  ]);

  return <CreditCardsBoard initial={cards} banks={banks} />;
}
