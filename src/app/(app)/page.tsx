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

  const data = await getDashboardData(year, month);

  return <DashboardBoard initialData={data} year={year} month={month} />;
}
