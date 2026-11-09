"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Plus, Pencil, Trash2, X, CreditCard as CardIcon, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { CardWithInvoices } from "@/lib/invoices/cards";
import type { InvoiceView } from "@/lib/invoices/invoiceService";
import { InvoiceList, InvoiceStatusBadge } from "./InvoiceList";
import { PayInvoiceDialog } from "./PayInvoiceDialog";

type Card = CardWithInvoices;

type FormValues = {
  id?: string;
  name: string;
  institution: string;
  limit: string;
  closingDay: string;
  dueDay: string;
  color: string;
};

const COLORS = ["#ec4899", "#6366f1", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];

function emptyForm(): FormValues {
  return { name: "", institution: "", limit: "", closingDay: "", dueDay: "", color: COLORS[0] };
}

export function CreditCardsBoard({ initial, banks }: { initial: Card[]; banks: { id: string; name: string }[] }) {
  const [cards, setCards] = useState(initial);
  const [formOpen, setFormOpen] = useState(false);
  const [values, setValues] = useState<FormValues>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [invoicesOpen, setInvoicesOpen] = useState<string | null>(null);
  const [paying, setPaying] = useState<{ invoice: InvoiceView; cardName: string } | null>(null);

  // Quando o servidor manda dados novos, o estado local é atualizado durante o
  // render (padrão recomendado pelo React no lugar de um efeito).
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setCards(initial);
  }

  async function reload() {
    const res = await fetch("/api/credit-cards");
    if (res.ok) setCards(await res.json());
  }

  function openNew() {
    setValues(emptyForm());
    setFormOpen(true);
  }

  function openEdit(card: Card) {
    setValues({
      id: card.id,
      name: card.name,
      institution: card.institution ?? "",
      limit: card.limit != null ? String(card.limit) : "",
      closingDay: card.closingDay != null ? String(card.closingDay) : "",
      dueDay: card.dueDay != null ? String(card.dueDay) : "",
      color: card.color,
    });
    setFormOpen(true);
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este cartão? As faturas dele são removidas; os lançamentos perdem a referência (não são excluídos).")) return;
    await fetch(`/api/credit-cards/${id}`, { method: "DELETE" });
    reload();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: values.name,
      institution: values.institution || null,
      limit: values.limit ? Number(values.limit) : null,
      closingDay: values.closingDay ? Number(values.closingDay) : null,
      dueDay: values.dueDay ? Number(values.dueDay) : null,
      color: values.color,
    };
    try {
      if (values.id) {
        await fetch(`/api/credit-cards/${values.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch("/api/credit-cards", {
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

  const totalInvoices = cards.reduce((acc, c) => acc + c.currentInvoice, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Cartões de Crédito</h1>
        <button type="button" onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          <Plus className="h-3.5 w-3.5" /> Novo cartão
        </button>
      </div>

      <div
        className={clsx(
          "rounded-2xl border p-5 flex flex-col gap-1",
          totalInvoices > 0 ? "border-negative/20 bg-negative-bg" : "border-border bg-surface"
        )}
      >
        <span className="text-xs font-medium text-muted">Total em aberto (todos os cartões)</span>
        <span className={clsx("text-2xl font-semibold", totalInvoices > 0 ? "text-negative" : "text-foreground")}>
          {formatCurrency(totalInvoices)}
        </span>
        <span className="text-xs text-muted">Soma das faturas ainda não pagas</span>
      </div>

      <div className="flex flex-col gap-3">
        {cards.map((card) => {
          const pct = card.limit ? Math.min(100, (card.currentInvoice / card.limit) * 100) : 0;
          const isOpen = expanded === card.id;
          const showInvoices = invoicesOpen === card.id;
          return (
            <div key={card.id} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ backgroundColor: card.color }}>
                    <CardIcon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{card.name}</p>
                    <p className="text-xs text-muted truncate">
                      {card.institution ?? "—"}
                      {card.closingDay ? ` · fecha dia ${card.closingDay}` : ""}
                      {card.dueDay ? ` · vence dia ${card.dueDay}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(card)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted" aria-label={`Editar ${card.name}`}>
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => handleDelete(card.id)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative" aria-label={`Excluir ${card.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!card.closingDay && (
                <p className="text-[11px] text-warning-fg bg-warning-bg rounded-lg px-3 py-2">
                  Informe o dia de fechamento para as compras caírem na fatura certa. Sem ele, cada fatura fecha no último dia do mês.
                </p>
              )}

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted mb-0.5">Em aberto</p>
                  <p className={clsx("text-lg font-semibold", card.currentInvoice > 0 ? "text-negative" : "text-foreground")}>
                    {formatCurrency(card.currentInvoice)}
                  </p>
                  {card.nextDue && (
                    <p className="text-[11px] text-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                      Próxima: {card.nextDue.label} · {formatCents(card.nextDue.remainingCents)} · vence {formatDate(card.nextDue.dueDate)}
                      <InvoiceStatusBadge status={card.nextDue.status} />
                    </p>
                  )}
                </div>
                {card.limit != null && (
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted mb-0.5">Limite</p>
                    <p className="text-sm font-medium">{formatCurrency(card.limit)}</p>
                  </div>
                )}
              </div>

              {card.limit != null && (
                <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div className={clsx("h-full rounded-full", pct >= 90 ? "bg-negative" : "bg-accent")} style={{ width: `${pct}%` }} />
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <button
                  type="button"
                  onClick={() => setInvoicesOpen(showInvoices ? null : card.id)}
                  aria-expanded={showInvoices}
                  className="flex items-center gap-1 text-xs font-medium text-accent"
                >
                  {showInvoices ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  Faturas ({card.invoices.length})
                </button>
                {card.byCategory.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : card.id)}
                    aria-expanded={isOpen}
                    className="flex items-center gap-1 text-xs font-medium text-accent"
                  >
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Gastos em aberto por categoria
                  </button>
                )}
              </div>

              {showInvoices && (
                <InvoiceList invoices={card.invoices} onPay={(invoice) => setPaying({ invoice, cardName: card.name })} />
              )}

              {isOpen && (
                <div className="flex flex-col gap-1.5">
                  {card.byCategory.map((c) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <span className="text-muted">{c.name}</span>
                      <span className="font-medium">{formatCurrency(c.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {cards.length === 0 && <p className="text-sm text-muted text-center py-8">Nenhum cartão cadastrado ainda.</p>}
      </div>

      {paying && (
        <PayInvoiceDialog
          invoice={paying.invoice}
          cardName={paying.cardName}
          banks={banks}
          onClose={() => setPaying(null)}
          onDone={() => {
            setPaying(null);
            reload();
          }}
        />
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFormOpen(false)} />
          <form onSubmit={handleSubmit} className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">{values.id ? "Editar cartão" : "Novo cartão"}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Nome do cartão</label>
              <input
                required
                value={values.name}
                onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
                placeholder="Ex: Itaú Click, Nubank Ultravioleta..."
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Instituição / bandeira</label>
              <input
                value={values.institution}
                onChange={(e) => setValues((v) => ({ ...v, institution: e.target.value }))}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted">Limite (R$)</label>
              <input
                type="number"
                step="0.01"
                value={values.limit}
                onChange={(e) => setValues((v) => ({ ...v, limit: e.target.value }))}
                className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                placeholder="Opcional"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Dia de fechamento</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={values.closingDay}
                  onChange={(e) => setValues((v) => ({ ...v, closingDay: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">Dia de vencimento</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={values.dueDay}
                  onChange={(e) => setValues((v) => ({ ...v, dueDay: e.target.value }))}
                  className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted -mt-2">
              Compras até o dia de fechamento entram na fatura do mês; depois dele, na fatura seguinte. Ao mudar esses dias, as faturas ainda não pagas são reorganizadas.
            </p>

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
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
            </div>

            <button type="submit" disabled={saving} className="mt-1 rounded-lg bg-accent text-accent-foreground text-sm font-medium py-2.5 hover:opacity-90 transition disabled:opacity-60">
              {saving ? "Salvando..." : "Salvar cartão"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
