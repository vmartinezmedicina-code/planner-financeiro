import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { listBanksWithBalance } from "@/lib/finance/banks";
import { BanksBoard } from "@/components/banks/BanksBoard";

export default async function BancosPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const banks = await listBanksWithBalance(session.householdId);
  return <BanksBoard initial={banks} />;
}
