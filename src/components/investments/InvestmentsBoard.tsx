"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";

type Investment = {
  id: string;
  product: string;
  institution: string;
  contributedAmount: number;
  contributionDate: string;
  currentValue: number;
  notes: string | null;
};

type FormValues = {
  id?: string;
  product: string;
  institution: string;
  contributedAmount: string;
  contributionDate: string;
  currentValue: string;
  notes: string;
};

function emptyForm(): FormValues {
  return {
    product: "",
    institution: "",
    contributedAmount: "",
    contributionDate: toDateInputValue(new Date()),
    currentValue: "",
    notes: "",
  };
}

export function InvestmentsBoard({ initial }: { initial: Investment[] }) {
  const [items, setItems] = useState(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => setItems(initial), [initial]);

  async function reload() {
    const res = await fetch("/api/investments");
    if (res.ok) setItems(await res.json());
  }

  function openNew() {
    setValues(emptyForm());
    setFormOpen(true);
  }

  function openEdit(inv: Investment) {
    setValues({
      id: inv.id,
      product: inv.product,
      institution: inv.institution,
      contributedAmount: String(inv.contributedAmount),
      contributionDate: toDateInputValue(inv.contributionDate),
      currentValue: String(inv.currentValue),
      notes: inv.notes ?? "",
    });
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este investimento?")) return;
    await fetch(`/api/investments/${id}`, { method: "DELETE" });
    reload();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      product: values.product,
      institution: values.institution,
      contributedAmount: Number(values.contributedAmount) || 0,
      contributionDate: values.contributionDate,
      currentValue: Number(values.currentValue) || 0,
      notes: values.notes || null,
    };
    try {
      if (values.id) {
        await fetch(`/api/investments/${values.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/investments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setFormOpen(false);
      reload();
    } finally {
      setSaving(false);
    }
  }

  const totalContributed = items.reduce((acc, i) => acc + i.contributedAmount, 0);
  const totalCurrent = items.reduce((acc, i) => acc + i.currentValue, 0);
  const totalReturn = totalCurrent - totalContributed;
  const returnPct = totalContributed > 0 ? (totalReturn / totalContributed) * 100 : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Investimentos</h1>
        <button type="button" onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          <Plus className="h-3.5 w-3.5" /> Novo investimento
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Total aportado</span>
          <span className="text-xl font-semibold text-foreground">{formatCurrency(totalContributed)}</span>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Valor atual da carteira</span>
          <span className="text-xl font-semibold text-foreground">{formatCurrency(totalCurrent)}</span>
        </div>
        <div
          className={clsx(
            "rounded-2xl border p-5 flex flex-col gap-1",
            totalReturn >= 0 ? "bg-positive-bg border-positive/20" : "bg-negative-bg border-negative/20"
          )}
        >
          <span className="text-xs font-medium text-muted">Rentabilidade</span>
          <span className={clsx("text-xl font-semibold flex items-center gap-1.5", totalReturn >= 0 ? "text-positive" : "text-negative")}>
            {totalReturn >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {formatCurrency(totalReturn)} ({returnPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-[720px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-2.5">Produto</th>
              <th className="p-2.5">Instituição</th>
              <th className="p-2.5">Data do aporte</th>
              <th className="p-2.5 text-right">Valor aportado</th>
              <th className="p-2.5 text-right">Valor atual</th>
              <th className="p-2.5 text-right">Rentabilidade</th>
              <th className="p-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {items.map((inv) => {
              const ret = inv.currentValue - inv.contributedAmount;
              const pct = inv.contributedAmount > 0 ? (ret / inv.contributedAmount) * 100 : 0;
              return (
                <tr key={inv.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                  <td className="p-2.5 font-medium">{inv.product}</td>
                  <td className="p-2.5 text-muted">{inv.institution}</td>
                  <td className="p-2.5 whitespace-nowrap text-muted">{formatDate(inv.contributionDate)}</td>
                  <td className="p-2.5 text-right whitespace-nowrap">{formatCurrency(inv.contributedAmount)}</td>
                  <td className="p-2.5 text-right whitespace-nowrap font-medium">{formatCurrency(inv.currentValue)}</td>
                  <td className={clsx("p-2.5 text-right whitespace-nowrap", ret >= 0 ? "text-positive" : "text-negative")}>
                    {formatCurrency(ret)} ({pct.toFixed(1)}%)
                  </td>
                  <td className="p-2.5">
                    <div className="flex items-center justify-end gap-1">
                      <button type="button" onClick={() => openEdit(inv)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-background">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(inv.id)}
                        className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-sm text-muted">
                  Nenhum investimento cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormOpen(false)} />
          <form
            onSubmit={handleSubmit}
            className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{values.id ? "Editar investimento" : "Novo investimento"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Produto / Tipo</label>
              <input
                required
                value={values.product}
                onChange={(e) => setValues((v) => ({ ...v, product: e.target.value }))}
                placeholder="Ex: Tesouro Selic, CDB, Ações..."
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Instituição</label>
              <input
                required
                value={values.institution}
                onChange={(e) => setValues((v) => ({ ...v, institution: e.target.value }))}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Data do aporte</label>
                <input
                  type="date"
                  required
                  value={values.contributionDate}
                  onChange={(e) => setValues((v) => ({ ...v, contributionDate: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Valor aportado (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={values.contributedAmount}
                  onChange={(e) => setValues((v) => ({ ...v, contributedAmount: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Valor atual (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={values.currentValue}
                onChange={(e) => setValues((v) => ({ ...v, currentValue: e.target.value }))}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Observações</label>
              <textarea
                value={values.notes}
                onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
                rows={2}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-1 rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar investimento"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
