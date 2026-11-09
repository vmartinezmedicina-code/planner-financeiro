import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { InvestmentsBoard } from "@/components/investments/InvestmentsBoard";

export default async function InvestimentosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const investments = await prisma.investment.findMany({
    where: { householdId: session.householdId },
    orderBy: { contributionDate: "desc" },
  });

  const serialized = investments.map((i) => ({
    id: i.id,
    product: i.product,
    institution: i.institution,
    contributedAmount: fromCents(i.contributedAmountCents),
    contributionDate: i.contributionDate.toISOString(),
    currentValue: fromCents(i.currentValueCents),
    notes: i.notes,
  }));

  return <InvestmentsBoard initial={serialized} />;
}
