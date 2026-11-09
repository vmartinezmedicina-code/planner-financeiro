import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getPlanningData, CategoryNode } from "@/lib/planning";
import { ReportBoard } from "@/components/reports/ReportBoard";

function flatten(nodes: CategoryNode[], depth = 0, out: { id: string; name: string; depth: number; planned: number; realized: number }[] = []) {
  for (const n of nodes) {
    out.push({ id: n.id, name: n.name, depth, planned: n.plannedTotal, realized: n.realizedTotal });
    flatten(n.children, depth + 1, out);
  }
  return out;
}

export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const year = Number(params.year) || now.getFullYear();
  const month = Number(params.month) || now.getMonth() + 1;

  const planning = await getPlanningData(session.householdId, year, month);

  return (
    <ReportBoard
      year={year}
      month={month}
      summary={planning.summary}
      receitas={flatten(planning.receitaRoots)}
      despesas={flatten(planning.despesaRoots)}
    />
  );
}
