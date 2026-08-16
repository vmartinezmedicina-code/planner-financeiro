import { getPlanningData } from "@/lib/planning";
import { PlanningBoard } from "@/components/planning/PlanningBoard";

export default async function PlanejamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const data = await getPlanningData(year, month);

  return <PlanningBoard initialData={data} year={year} month={month} />;
}
