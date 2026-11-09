import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { DashboardBoard } from "@/components/dashboard/DashboardBoard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const session = await getSession();
  if (!session) redirect("/login");
  const data = await getDashboardData(session.householdId, year, month);

  return <DashboardBoard initialData={data} year={year} month={month} />;
}
