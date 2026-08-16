"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CategoryOption } from "@/lib/categories";
import { toDateInputValue } from "@/lib/format";

export type TransactionFormValues = {
  id?: string;
  eventDate: string;
  settlementDate: string;
  categoryId: string;
  bankInstitution: string;
  creditCard: string;
  description: string;
  amount: string;
  kind: "receita" | "despesa";
  status: "PENDENTE" | "PAGO" | "CONFIRMADO";
  isRecurring: boolean;
};

export function emptyTransactionForm(): TransactionFormValues {
  return {
    eventDate: toDateInputValue(new Date()),
    settlementDate: "",
    categoryId: "",
    bankInstitution: "",
    creditCard: "",
    description: "",
    amount: "",
    kind: "despesa",
    status: "PENDENTE",
    isRecurring: false,
  };
}

export function TransactionForm({
  categories,
  initial,
  onClose,
  onSubmit,
}: {
  categories: CategoryOption[];
  initial: TransactionFormValues;
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

  const filteredCategories = categories.filter((c) => c.type === (values.kind === "receita" ? "RECEITA" : "DESPESA"));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {initial.id ? "Editar lançamento" : "Novo lançamento"}
          </h2>
          <button type="button" onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-2">
          {(["despesa", "receita"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => set("kind", kind)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize border ${
                values.kind === kind
                  ? kind === "despesa"
                    ? "bg-negative-bg border-negative text-negative"
                    : "bg-positive-bg border-positive text-positive"
                  : "border-border text-muted"
              }`}
            >
              {kind}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Data do evento</label>
            <input
              type="date"
              required
              value={values.eventDate}
              onChange={(e) => set("eventDate", e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Data da efetivação</label>
            <input
              type="date"
              value={values.settlementDate}
              onChange={(e) => set("settlementDate", e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Categoria</label>
          <select
            value={values.categoryId}
            onChange={(e) => set("categoryId", e.target.value)}
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">Sem categoria</option>
            {filteredCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Instituição Financeira</label>
            <input
              value={values.bankInstitution}
              onChange={(e) => set("bankInstitution", e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="Ex: Nubank"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Cartão de Crédito</label>
            <input
              value={values.creditCard}
              onChange={(e) => set("creditCard", e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="Ex: Cartão final 1234"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Descrição</label>
          <input
            required
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Valor (R$)</label>
            <input
              type="number"
              step="0.01"
              required
              value={values.amount}
              onChange={(e) => set("amount", e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              placeholder="0,00"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">Status</label>
            <select
              value={values.status}
              onChange={(e) => set("status", e.target.value as TransactionFormValues["status"])}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="PENDENTE">Pendente</option>
              <option value="PAGO">Pago</option>
              <option value="CONFIRMADO">Confirmado</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={values.isRecurring}
            onChange={(e) => set("isRecurring", e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Lançamento recorrente
        </label>

        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60"
        >
          {saving ? "Salvando..." : "Salvar lançamento"}
        </button>
      </form>
    </div>
  );
}
