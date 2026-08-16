"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, X, Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/format";

type Bank = {
  id: string;
  name: string;
  initialBalance: number;
  currentBalance: number;
  color: string;
};

type FormValues = { id?: string; name: string; initialBalance: string; color: string };

const COLORS = ["#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#ec4899", "#8b5cf6", "#ef4444"];

function emptyForm(): FormValues {
  return { name: "", initialBalance: "", color: COLORS[0] };
}

export function BanksBoard({ initial }: { initial: Bank[] }) {
  const [banks, setBanks] = useState(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => setBanks(initial), [initial]);

  async function reload() {
    const res = await fetch("/api/banks");
    if (res.ok) setBanks(await res.json());
  }

  function openNew() {
    setValues(emptyForm());
    setFormOpen(true);
  }

  function openEdit(bank: Bank) {
    setValues({ id: bank.id, name: bank.name, initialBalance: String(bank.initialBalance), color: bank.color });
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este banco? Os lançamentos vinculados perdem a referência (não são excluídos).")) return;
    await fetch(`/api/banks/${id}`, { method: "DELETE" });
    reload();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: values.name,
      initialBalance: Number(values.initialBalance) || 0,
      color: values.color,
    };
    try {
      if (values.id) {
        await fetch(`/api/banks/${values.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/banks", {
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

  const totalBalance = banks.reduce((acc, b) => acc + b.currentBalance, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Bancos</h1>
        <button type="button" onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          <Plus className="h-3.5 w-3.5" /> Novo banco
        </button>
      </div>

      <div className={clsx("rounded-2xl border p-5 flex flex-col gap-1", totalBalance >= 0 ? "bg-positive-bg border-positive/20" : "bg-negative-bg border-negative/20")}>
        <span className="text-xs font-medium text-muted">Saldo total em contas</span>
        <span className={clsx("text-2xl font-semibold", totalBalance >= 0 ? "text-positive" : "text-negative")}>{formatCurrency(totalBalance)}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {banks.map((bank) => (
          <div key={bank.id} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: bank.color }}>
                  <Landmark className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{bank.name}</p>
                  <p className="text-xs text-muted">Saldo inicial: {formatCurrency(bank.initialBalance)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => openEdit(bank)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(bank.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted mb-0.5">Saldo atual</p>
              <p className={clsx("text-lg font-semibold", bank.currentBalance >= 0 ? "text-positive" : "text-negative")}>
                {formatCurrency(bank.currentBalance)}
              </p>
            </div>
          </div>
        ))}
        {banks.length === 0 && (
          <p className="text-sm text-muted col-span-full text-center py-8">Nenhum banco cadastrado ainda.</p>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormOpen(false)} />
          <form onSubmit={handleSubmit} className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{values.id ? "Editar banco" : "Novo banco"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Nome do banco</label>
              <input
                required
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Ex: Nubank, Itaú, Bradesco..."
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Saldo inicial (R$)</label>
              <input
                type="number"
                step="0.01"
                required
                value={values.initialBalance}
                onChange={(e) => setValues((v) => ({ ...v, initialBalance: e.target.value }))}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                placeholder="0,00"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Cor</label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setValues((v) => ({ ...v, color: c }))}
                    className={clsx("h-7 w-7 rounded-full", values.color === c && "ring-2 ring-offset-2 ring-offset-surface ring-accent")}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <button type="submit" disabled={saving} className="mt-1 rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60">
              {saving ? "Salvando..." : "Salvar banco"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
