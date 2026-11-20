import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listGoals } from "@/lib/goals/goalService";
import { listBanksWithBalance } from "@/lib/finance/banks";
import { GoalsBoard } from "@/components/goals/GoalsBoard";

export default async function MetasPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const [data, banks, investments] = await Promise.all([
    listGoals(session.householdId),
    listBanksWithBalance(session.householdId),
    prisma.investment.findMany({
      where: { householdId: session.householdId },
      orderBy: { contributionDate: "desc" },
      select: { id: true, product: true, institution: true, currentValueCents: true },
    }),
  ]);

  return (
    <GoalsBoard
      initial={data}
      banks={banks.map((b) => ({ id: b.id, name: b.name, color: b.color, balanceCents: b.currentBalanceCents }))}
      investments={investments.map((i) => ({ id: i.id, name: `${i.product} · ${i.institution}`, balanceCents: i.currentValueCents }))}
    />
  );
}
