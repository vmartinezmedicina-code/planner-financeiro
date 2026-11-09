import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listMembers } from "@/lib/household/householdService";
import { AccountBoard } from "@/components/account/AccountBoard";

export default async function ContaPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const members = await listMembers(session.householdId);
  return <AccountBoard name={session.name} email={session.email} members={members} />;
}
