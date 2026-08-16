import { prisma } from "@/lib/prisma";
import { InvestmentsBoard } from "@/components/investments/InvestmentsBoard";

export default async function InvestimentosPage() {
  const investments = await prisma.investment.findMany({ orderBy: { contributionDate: "desc" } });

  const serialized = investments.map((i) => ({
    id: i.id,
    product: i.product,
    institution: i.institution,
    contributedAmount: i.contributedAmount,
    contributionDate: i.contributionDate.toISOString(),
    currentValue: i.currentValue,
    notes: i.notes,
  }));

  return <InvestmentsBoard initial={serialized} />;
}
