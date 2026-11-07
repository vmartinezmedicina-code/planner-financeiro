import { getSession } from "@/lib/auth";
import { AccountBoard } from "@/components/account/AccountBoard";

export default async function ContaPage() {
  const session = await getSession();
  return <AccountBoard name={session?.name ?? ""} email={session?.email ?? ""} />;
}
