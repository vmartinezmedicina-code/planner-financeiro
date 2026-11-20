import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getCategoryOptions } from "@/lib/categories";
import { listMembers } from "@/lib/household/householdService";
import { getImportView, ImportError } from "@/lib/imports/importService";
import { ImportReview } from "@/components/imports/ImportReview";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const hh = session.householdId;
  const { id } = await params;

  let view;
  try {
    view = await getImportView(id, hh);
  } catch (e) {
    if (e instanceof ImportError) notFound();
    throw e;
  }

  const [categories, members, card] = await Promise.all([
    getCategoryOptions(hh),
    listMembers(hh),
    view.creditCardId ? prisma.creditCard.findFirst({ where: { id: view.creditCardId, householdId: hh }, select: { closingDay: true, dueDay: true } }) : null,
  ]);

  return <ImportReview initial={view} categories={categories} members={members.filter((m) => m.isActive).map((m) => ({ id: m.id, name: m.name }))} card={card} />;
}
