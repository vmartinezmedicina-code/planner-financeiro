"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { MONTH_NAMES } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { DashboardData } from "@/lib/dashboard";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardKpis, DashboardSecondary, type DrawerView } from "./DashboardKpis";
import { DashboardCashFlow } from "./DashboardCashFlow";
import { DashboardUpcoming } from "./DashboardUpcoming";
import { AnalyticsDrawer } from "./AnalyticsDrawer";
import { BalanceDetail, CardsDetail } from "./DashboardDetails";
import { CategoryExplorer } from "@/components/analytics/CategoryExplorer";

const DRAWER_TITLE: Record<DrawerView, string> = {
  saldo: "Saldo disponível",
  receitas: "Receitas",
  despesas: "Despesas",
  cartoes: "Cartões",
};

/**
 * Dashboard 2.0. Primeiro nível: situação (indicadores, fluxo, próximos
 * vencimentos). O detalhe só aparece quando o usuário clica, em um painel
 * que não empurra o resto da tela.
 */
export function DashboardBoard({ initialData }: { initialData: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [drawer, setDrawer] = useState<DrawerView | null>(null);

  // Quando o servidor manda dados novos, o estado local é atualizado durante o
  // render (padrão recomendado pelo React no lugar de um efeito).
  const [synced, setSynced] = useState(initialData);
  if (synced !== initialData) {
    setSynced(initialData);
    setData(initialData);
  }

  const changeMonth = useCallback(
    async (y: number, m: number) => {
      router.push(`/?year=${y}&month=${m}`, { scroll: false });
      const res = await fetch(`/api/dashboard?year=${y}&month=${m}`);
      if (res.ok) setData(await res.json());
    },
    [router]
  );

  const monthLabel = `${MONTH_NAMES[data.month - 1]} de ${data.year}`;

  return (
    <div className="flex flex-col gap-4">
      <DashboardHeader year={data.year} month={data.month} isCurrentMonth={data.isCurrentMonth} onChange={changeMonth} />

      {data.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          {data.alerts.map((a) => (
            <div key={`${a.card}-${a.label}`} className="flex items-center gap-2 rounded-xl bg-warning-bg text-warning-fg px-4 py-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Fatura <strong>{a.card}</strong> {a.label} ({formatCents(a.remainingCents)}){" "}
                {a.daysLeft < 0
                  ? `venceu há ${-a.daysLeft} dia${a.daysLeft === -1 ? "" : "s"}`
                  : a.daysLeft === 0
                    ? "vence hoje"
                    : a.daysLeft === 1
                      ? "vence amanhã"
                      : `vence em ${a.daysLeft} dias`}
                .
              </span>
            </div>
          ))}
        </div>
      )}

      <DashboardKpis data={data} onOpen={setDrawer} />
      <DashboardSecondary data={data} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3">
          <DashboardCashFlow evolution={data.evolution} onSelectMonth={changeMonth} />
        </div>
        <div className="lg:col-span-2">
          <DashboardUpcoming upcoming={data.upcoming} />
        </div>
      </div>

      {drawer && (
        <AnalyticsDrawer
          title={DRAWER_TITLE[drawer]}
          subtitle={drawer === "saldo" || drawer === "cartoes" ? "situação de hoje" : monthLabel}
          onClose={() => setDrawer(null)}
        >
          {drawer === "saldo" && <BalanceDetail balance={data.balance} />}
          {drawer === "cartoes" && <CardsDetail cards={data.cards} />}
          {drawer === "despesas" && <CategoryExplorer type="DESPESA" year={data.year} month={data.month} onMonthChange={changeMonth} />}
          {drawer === "receitas" && <CategoryExplorer type="RECEITA" year={data.year} month={data.month} onMonthChange={changeMonth} />}
        </AnalyticsDrawer>
      )}
    </div>
  );
}
