import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { listMembers } from "@/lib/household/householdService";
import { getCategoryOptions } from "@/lib/categories";
import { TransactionsBoard } from "@/components/transactions/TransactionsBoard";

export default async function LancamentosPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const hh = session.householdId;
  const [categories, banks, creditCards, members] = await Promise.all([
    getCategoryOptions(hh),
    prisma.bank.findMany({ where: { householdId: hh }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    prisma.creditCard.findMany({ where: { householdId: hh }, orderBy: { order: "asc" }, select: { id: true, name: true } }),
    listMembers(hh),
  ]);

  const categoryPathById = Object.fromEntries(categories.map((c) => [c.id, c.label]));

  return (
    <TransactionsBoard
      categories={categories}
      banks={banks}
      creditCards={creditCards}
      categoryPathById={categoryPathById}
      members={members.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      defaultMemberId={session.memberId}
    />
  );
}
