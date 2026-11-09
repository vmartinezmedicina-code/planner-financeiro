import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { todayAsUtcDate } from "@/lib/format";
import { DashboardBoard } from "@/components/dashboard/DashboardBoard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = todayAsUtcDate(); // mês corrente no fuso do app, não no do servidor
  const y = Number(params.year);
  const m = Number(params.month);
  const year = Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : today.getUTCFullYear();
  const month = Number.isInteger(m) && m >= 1 && m <= 12 ? m : today.getUTCMonth() + 1;

  const data = await getDashboardData(session.householdId, year, month);

  return <DashboardBoard initialData={data} />;
}
