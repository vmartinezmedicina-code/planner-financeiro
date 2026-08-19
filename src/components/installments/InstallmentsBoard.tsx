"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { CalendarClock, CreditCard, Trash2, Layers } from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { formatCurrency, formatDate } from "@/lib/format";

type Purchase = {
  id: string;
  description: string;
  totalAmount: number;
  installmentsCount: number;
  purchaseDate: string;
  category: { id: string; name: string } | null;
  creditCard: { id: string; name: string };
  installments: { id: string; eventDate: string; amount: number; installmentNumber: number | null }[];
};

const PIE_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#8b5cf6", "#14b8a6"];

export function InstallmentsBoard({ initial }: { initial: Purchase[] }) {
  const [purchases, setPurchases] = useState(initial);

  useEffect(() => setPurchases(initial), [initial]);

  async function reload() {
    const res = await fetch("/api/installments");
    if (res.ok) setPurchases(await res.json());
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta compra parcelada? Todas as parcelas (inclusive já pagas) serão removidas.")) return;
    await fetch(`/api/installments/${id}`, { method: "DELETE" });
    reload();
  }

  const totalCommitted = purchases.reduce((acc, p) => acc + p.totalAmount, 0);

  const bySector = new Map<string, number>();
  for (const p of purchases) {
    const label = p.category?.name ?? "Sem categoria";
    bySector.set(label, (bySector.get(label) ?? 0) + p.totalAmount);
  }
  const chartData = [...bySector.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const today = new Date();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Compras Parceladas</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Total comprometido (todas as parcelas)</span>
          <span className="text-xl font-semibold text-foreground">{formatCurrency(totalCommitted)}</span>
          <span className="text-xs text-muted">{purchases.length} compra(s) parcelada(s)</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Setores envolvidos</span>
          <span className="text-xl font-semibold text-foreground">{chartData.length}</span>
          <span className="text-xs text-muted">categorias diferentes com compras parceladas</span>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-accent" /> Distribuição por setor (categoria)
        </h2>
        {chartData.length === 0 ? (
          <p className="text-xs text-muted py-6 text-center">Nenhuma compra parcelada cadastrada ainda.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                >
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value ?? 0))}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        {purchases.map((p) => {
          const paidCount = p.installments.filter((i) => new Date(i.eventDate) <= today).length;
          const installmentValue = p.totalAmount / p.installmentsCount;
          return (
            <div key={p.id} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{p.description}</p>
                  <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                    <CreditCard className="h-3 w-3" /> {p.creditCard.name}
                    {p.category && <span> · {p.category.name}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(p.id)}
                  className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                <span className="text-foreground font-medium">{formatCurrency(p.totalAmount)}</span>
                <span className="text-muted">{formatCurrency(installmentValue)}/mês</span>
                <span
                  className={clsx(
                    "text-xs rounded-full px-2 py-0.5",
                    paidCount >= p.installmentsCount ? "bg-positive-bg text-positive" : "bg-accent/10 text-accent"
                  )}
                >
                  {paidCount}/{p.installmentsCount} parcelas
                </span>
                <span className="text-xs text-muted flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" /> desde {formatDate(p.purchaseDate)}
                </span>
              </div>
            </div>
          );
        })}
        {purchases.length === 0 && (
          <p className="text-sm text-muted text-center py-6">
            Nenhuma compra parcelada ainda. Crie uma em Lançamentos → Adicionar → Crédito → "Compra parcelada".
          </p>
        )}
      </section>
    </div>
  );
}
