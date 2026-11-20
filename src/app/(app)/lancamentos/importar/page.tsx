import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/provider";
import { listMembers } from "@/lib/household/householdService";
import { listImports } from "@/lib/imports/importService";
import { ImportStart } from "@/components/imports/ImportStart";

export default async function ImportarPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const hh = session.householdId;
  const [banks, cards, members, recent] = await Promise.all([
    prisma.bank.findMany({ where: { householdId: hh }, orderBy: { order: "asc" }, select: { id: true, name: true, color: true } }),
    prisma.creditCard.findMany({ where: { householdId: hh }, orderBy: { order: "asc" }, select: { id: true, name: true, color: true, closingDay: true, dueDay: true } }),
    listMembers(hh),
    listImports(hh),
  ]);

  return (
    <ImportStart
      banks={banks}
      cards={cards}
      members={members.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))}
      defaultMemberId={session.memberId}
      aiEnabled={aiConfigured()}
      recent={recent}
    />
  );
}
