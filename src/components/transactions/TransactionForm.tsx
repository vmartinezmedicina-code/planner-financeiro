"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { CategoryOption } from "@/lib/categories";
import { todayInputValue } from "@/lib/format";
import { PAYMENT_METHOD_LABEL } from "@/lib/paymentMethod";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { CategoryPicker } from "@/components/ui/CategoryPicker";

export type PaymentMethodValue = "DEBITO" | "CREDITO" | "PIX" | "DINHEIRO";

export type TransactionFormValues = {
  id?: string;
  eventDate: string;
  settlementDate: string;
  categoryId: string;
  paymentMethod: PaymentMethodValue;
  bankId: string;
  creditCardId: string;
  memberId: string;
  description: string;
  amount: string;
  kind: "receita" | "despesa";
  status: "PENDENTE" | "PAGO" | "CONFIRMADO";
  isRecurring: boolean;
  isInstallment: boolean;
  installmentsCount: string;
};

const PAYMENT_METHODS: PaymentMethodValue[] = ["DEBITO", "CREDITO", "PIX", "DINHEIRO"];

export function emptyTransactionForm(defaultMemberId = ""): TransactionFormValues {
  return {
    eventDate: todayInputValue(),
    settlementDate: "",
    categoryId: "",
    paymentMethod: "DEBITO",
    bankId: "",
    creditCardId: "",
    memberId: defaultMemberId,
    description: "",
    amount: "",
    kind: "despesa",
    status: "PENDENTE",
    isRecurring: false,
    isInstallment: false,
    installmentsCount: "2",
  };
}

export function TransactionForm({
  categories,
  banks,
  creditCards,
  members,
  initial,
  onClose,
  onSubmit,
}: {
  categories: CategoryOption[];
  banks: { id: string; name: string; color?: string }[];
  creditCards: { id: string; name: string; color?: string }[];
  members: { id: string; name: string }[];
  initial: TransactionFormValues;
  onClose: () => void;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<TransactionFormValues>(() => ({
    ...initial,
    bankId: initial.bankId || (!initial.id && banks.length === 1 ? banks[0].id : ""),
    creditCardId: initial.creditCardId || (!initial.id && creditCards.length === 1 ? creditCards[0].id : ""),
  }));
  const [saving, setSaving] = useState(false);

  function set<K extends keyof TransactionFormValues>(key: K, value: TransactionFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.paymentMethod === "CREDITO" && creditCards.length > 0 && !values.creditCardId) {
      setError("Escolha o cartão de crédito.");
      return;
    }
    if (values.paymentMethod !== "CREDITO" && banks.length > 0 && !values.bankId) {
      setError(values.kind === "receita" ? "Escolha a conta que recebe." : "Escolha a instituição financeira.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } finally {
      setSaving(false);
    }
  }

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
              onClick={() => {
                if (kind === values.kind) return;
                const cat = categories.find((c) => c.id === values.categoryId);
                const wanted = kind === "receita" ? "RECEITA" : "DESPESA";
                setValues((v) => ({ ...v, kind, categoryId: cat && cat.type !== wanted ? "" : v.categoryId }));
              }}
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

        <CategoryPicker
          key={values.kind}
          categories={categories}
          type={values.kind === "receita" ? "RECEITA" : "DESPESA"}
          value={values.categoryId}
          onChange={(id) => set("categoryId", id)}
          label={values.kind === "receita" ? "Categoria da receita" : "Categoria"}
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Forma de pagamento</label>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm}
                type="button"
                onClick={() => set("paymentMethod", pm)}
                className={`rounded-lg py-1.5 text-xs font-medium border transition ${
                  values.paymentMethod === pm
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border text-muted hover:text-foreground"
                }`}
              >
                {PAYMENT_METHOD_LABEL[pm]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-0.5">
            {values.paymentMethod === "CREDITO"
              ? "Vai para a fatura do cartão — não mexe no saldo do banco."
              : "Sai direto do saldo do banco selecionado abaixo."}
          </p>
        </div>

        {values.paymentMethod === "CREDITO" ? (
          <ChoiceChips
            label="Cartão de crédito"
            options={creditCards.map((c) => ({ value: c.id, label: c.name, color: c.color }))}
            value={values.creditCardId}
            onChange={(v) => set("creditCardId", v)}
            emptyText={<>Nenhum cartão cadastrado — cadastre em &quot;Cartões&quot;.</>}
          />
        ) : null}

        {values.paymentMethod === "CREDITO" && !initial.id && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-muted p-3">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={values.isInstallment}
                onChange={(e) => set("isInstallment", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Compra parcelada
            </label>
            {values.isInstallment && (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Número de parcelas</label>
                <input
                  type="number"
                  min={2}
                  max={60}
                  step={1}
                  value={values.installmentsCount}
                  onChange={(e) => set("installmentsCount", e.target.value)}
                  className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent w-32"
                />
                <p className="text-[11px] text-muted">
                  A &quot;Data do evento&quot; abaixo é a data da 1ª parcela. As demais são lançadas automaticamente, uma por
                  mês, dividindo o valor total informado.
                </p>
              </div>
            )}
          </div>
        )}

        {values.paymentMethod !== "CREDITO" && (
          <ChoiceChips
            label={values.kind === "receita" ? "Conta que recebe" : "Instituição financeira"}
            options={banks.map((b) => ({ value: b.id, label: b.name, color: b.color }))}
            value={values.bankId}
            onChange={(v) => set("bankId", v)}
            emptyText={<>Nenhum banco cadastrado — cadastre em &quot;Bancos&quot;.</>}
          />
        )}

        {members.length > 0 && (
          <ChoiceChips
            label="De quem é (opcional)"
            options={members.map((m) => ({ value: m.id, label: m.name }))}
            value={values.memberId}
            onChange={(v) => set("memberId", v)}
            allowClear
            clearLabel="Família"
          />
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Descrição</label>
          <input
            required
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted">
              {values.isInstallment ? "Valor total da compra (R$)" : "Valor (R$)"}
            </label>
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
        </div>

        <ChoiceChips
          label="Status"
          columns={3}
          options={[
            { value: "PENDENTE", label: "Pendente" },
            { value: "PAGO", label: "Pago" },
            { value: "CONFIRMADO", label: "Confirmado" },
          ]}
          value={values.status}
          onChange={(v) => set("status", v as TransactionFormValues["status"])}
        />

        {!values.isInstallment && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={values.isRecurring}
              onChange={(e) => set("isRecurring", e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Lançamento recorrente
          </label>
        )}

        {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-1 rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60"
        >
          {saving
            ? "Salvando..."
            : values.isInstallment
              ? `Criar ${values.installmentsCount || "?"} parcelas`
              : "Salvar lançamento"}
        </button>
      </form>
    </div>
  );
}
