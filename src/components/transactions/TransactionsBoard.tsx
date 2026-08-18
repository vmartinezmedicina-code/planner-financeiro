"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  Plus,
  Upload,
  Download,
  Wand2,
  Repeat,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Search,
  X,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatDate, toDateInputValue } from "@/lib/format";
import type { CategoryOption } from "@/lib/categories";
import { PAYMENT_METHOD_LABEL } from "@/lib/paymentMethod";
import { TransactionForm, TransactionFormValues, PaymentMethodValue, emptyTransactionForm } from "./TransactionForm";

type Transaction = {
  id: string;
  eventDate: string;
  settlementDate: string | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  paymentMethod: PaymentMethodValue;
  bankId: string | null;
  bank: { id: string; name: string } | null;
  creditCardId: string | null;
  creditCardRef: { id: string; name: string } | null;
  description: string;
  amount: number;
  status: "PENDENTE" | "PAGO" | "CONFIRMADO";
  isRecurring: boolean;
};

type ListResponse = {
  items: Transaction[];
  total: number;
  totalAmount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  uncategorizedCount: number;
};

const STATUS_LABEL: Record<Transaction["status"], string> = {
  PENDENTE: "Pendente",
  PAGO: "Pago",
  CONFIRMADO: "Confirmado",
};

const STATUS_CLASS: Record<Transaction["status"], string> = {
  PENDENTE: "bg-warning-bg text-warning-fg",
  PAGO: "bg-positive-bg text-positive",
  CONFIRMADO: "bg-accent/10 text-accent",
};

export function TransactionsBoard({
  categories,
  banks,
  creditCards,
  categoryPathById,
}: {
  categories: CategoryOption[];
  banks: { id: string; name: string }[];
  creditCards: { id: string; name: string }[];
  categoryPathById: Record<string, string>;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bankId, setBankId] = useState("Todas");
  const [creditCardId, setCreditCardId] = useState("Todos");
  const [status, setStatus] = useState("Todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [bulkCategorizeOpen, setBulkCategorizeOpen] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [quickText, setQuickText] = useState("");
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickPrefill, setQuickPrefill] = useState<TransactionFormValues | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (bankId !== "Todas") params.set("bankId", bankId);
    if (creditCardId !== "Todos") params.set("creditCardId", creditCardId);
    if (status !== "Todos") params.set("status", status);
    if (search) params.set("search", search);
    params.set("page", String(page));
    const res = await fetch(`/api/transactions?${params.toString()}`);
    if (res.ok) {
      const json = (await res.json()) as ListResponse;
      setData(json);
      setSelected(new Set());
    }
  }, [startDate, endDate, bankId, creditCardId, status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  function clearFilters() {
    setStartDate("");
    setEndDate("");
    setBankId("Todas");
    setCreditCardId("Todos");
    setStatus("Todos");
    setSearch("");
    setPage(1);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelected((prev) => (prev.size === data.items.length ? new Set() : new Set(data.items.map((i) => i.id))));
  }

  function openNew() {
    setEditing(null);
    setQuickPrefill(null);
    setFormOpen(true);
  }

  function openEdit(t: Transaction) {
    setEditing(t);
    setQuickPrefill(null);
    setFormOpen(true);
  }

  async function handleQuickParse(e: React.FormEvent) {
    e.preventDefault();
    if (!quickText.trim() || quickLoading) return;
    setQuickLoading(true);
    setQuickError(null);
    try {
      const res = await fetch("/api/transactions/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setQuickError(json.error || "Não foi possível interpretar essa mensagem.");
        return;
      }
      setEditing(null);
      setQuickPrefill({
        eventDate: json.eventDate || toDateInputValue(new Date()),
        settlementDate: json.settlementDate || "",
        categoryId: json.categoryId || "",
        paymentMethod: json.paymentMethod || "DEBITO",
        bankId: json.bankId || "",
        creditCardId: json.creditCardId || "",
        description: json.description || quickText.trim(),
        amount: json.amount ? String(json.amount) : "",
        kind: json.kind === "receita" ? "receita" : "despesa",
        status: "PENDENTE",
        isRecurring: false,
      });
      setFormOpen(true);
      if (json.warning) setQuickError(json.warning);
      setQuickText("");
    } catch {
      setQuickError("Não foi possível conectar ao serviço de interpretação.");
    } finally {
      setQuickLoading(false);
    }
  }

  async function handleSave(values: TransactionFormValues) {
    const amountAbs = Math.abs(Number(values.amount) || 0);
    const amount = values.kind === "despesa" ? -amountAbs : amountAbs;
    const payload = {
      eventDate: values.eventDate,
      settlementDate: values.settlementDate || null,
      categoryId: values.categoryId || null,
      paymentMethod: values.paymentMethod,
      bankId: values.bankId || null,
      creditCardId: values.creditCardId || null,
      description: values.description,
      amount,
      status: values.status,
      isRecurring: values.isRecurring,
    };

    if (values.id) {
      await fetch(`/api/transactions/${values.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setFormOpen(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este lançamento?")) return;
    await fetch(`/api/transactions/${id}`, { method: "DELETE" });
    load();
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Excluir ${selected.size} lançamento(s) selecionado(s)?`)) return;
    await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action: "delete" }),
    });
    load();
  }

  async function confirmBulkCategorize() {
    if (selected.size === 0) return;
    await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action: "categorize", categoryId: bulkCategoryId || null }),
    });
    setBulkCategorizeOpen(false);
    setBulkCategoryId("");
    load();
  }

  async function handleBulkRecurring() {
    if (selected.size === 0) return;
    await fetch("/api/transactions/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [...selected], action: "recurring", isRecurring: true }),
    });
    load();
  }

  async function handleAutoCategorize() {
    setBusy(true);
    try {
      const res = await fetch("/api/transactions/auto-categorize", { method: "POST" });
      const json = await res.json();
      setMessage(`${json.matched} de ${json.total} lançamento(s) categorizado(s) automaticamente.`);
      load();
    } finally {
      setBusy(false);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    window.open(`/api/transactions/export?${params.toString()}`, "_blank");
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    setBusy(true);
    try {
      const res = await fetch("/api/transactions/import", { method: "POST", body: formData });
      const json = await res.json();
      if (res.ok) setMessage(`${json.created} lançamento(s) importado(s), ${json.skipped} ignorado(s).`);
      else setMessage(json.error || "Erro ao importar.");
      load();
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const editingValues: TransactionFormValues = editing
    ? {
        id: editing.id,
        eventDate: toDateInputValue(editing.eventDate),
        settlementDate: editing.settlementDate ? toDateInputValue(editing.settlementDate) : "",
        categoryId: editing.categoryId ?? "",
        paymentMethod: editing.paymentMethod,
        bankId: editing.bankId ?? "",
        creditCardId: editing.creditCardId ?? "",
        description: editing.description,
        amount: String(Math.abs(editing.amount)),
        kind: editing.amount < 0 ? "despesa" : "receita",
        status: editing.status,
        isRecurring: editing.isRecurring,
      }
    : quickPrefill ?? emptyTransactionForm();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Lançamentos</h1>
      </div>

      <form onSubmit={handleQuickParse} className="flex flex-col gap-2 rounded-2xl border border-accent/30 bg-accent/5 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Sparkles className="h-4 w-4 text-accent" />
          Lançamento rápido por texto
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder='Ex: "Mercado no crédito Nubank, R$ 230,50 hoje"'
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            type="submit"
            disabled={quickLoading || !quickText.trim()}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium px-4 py-2 disabled:opacity-40 shrink-0"
          >
            {quickLoading ? "Interpretando..." : "Interpretar"}
          </button>
        </div>
        <p className="text-[11px] text-muted">
          Diga o valor, categoria, forma de pagamento (débito/crédito/pix/dinheiro) e a data — a IA preenche o
          formulário pra você conferir e salvar. Nada é lançado sem sua confirmação.
        </p>
        {quickError && <p className="text-xs text-warning-fg bg-warning-bg rounded-lg px-3 py-2">{quickError}</p>}
      </form>

      {data && data.uncategorizedCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-warning-bg text-warning-fg px-4 py-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {data.uncategorizedCount} lançamento(s) sem categoria neste filtro.
          </span>
          <button
            type="button"
            onClick={handleAutoCategorize}
            disabled={busy}
            className="font-medium underline underline-offset-2 shrink-0"
          >
            Aplicar regras automáticas
          </button>
        </div>
      )}

      {message && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-accent/10 text-accent px-4 py-2 text-sm">
          <span>{message}</span>
          <button type="button" onClick={() => setMessage(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 bg-surface border border-border rounded-2xl p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Data início</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-sm outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Data fim</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-sm outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Conta / Instituição</label>
          <select
            value={bankId}
            onChange={(e) => {
              setBankId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-sm outline-none"
          >
            <option value="Todas">Todas</option>
            {banks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Cartão de Crédito</label>
          <select
            value={creditCardId}
            onChange={(e) => {
              setCreditCardId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-sm outline-none"
          >
            <option value="Todos">Todos</option>
            {creditCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted">Status</label>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-border bg-surface-muted px-2.5 py-1.5 text-sm outline-none"
          >
            <option>Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PAGO">Pago</option>
            <option value="CONFIRMADO">Confirmado</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-muted">Buscar / relatório</label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Descrição..."
              className="w-full rounded-lg border border-border bg-surface-muted pl-8 pr-2.5 py-1.5 text-sm outline-none"
            />
          </div>
        </div>
        <button type="button" onClick={clearFilters} className="text-xs font-medium text-muted hover:text-foreground underline underline-offset-2">
          Limpar Filtros
        </button>
      </div>

      {/* Barra de ações */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={openNew} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
        <button
          type="button"
          onClick={() => setBulkCategorizeOpen(true)}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 disabled:opacity-40"
        >
          <Pencil className="h-3.5 w-3.5" /> Editar em lote
        </button>
        <button
          type="button"
          onClick={handleAutoCategorize}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 disabled:opacity-40"
        >
          <Wand2 className="h-3.5 w-3.5" /> Regras automáticas
        </button>
        <button
          type="button"
          onClick={handleBulkRecurring}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 disabled:opacity-40"
        >
          <Repeat className="h-3.5 w-3.5" /> Marcar recorrente
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2"
        >
          <Upload className="h-3.5 w-3.5" /> Importar
        </button>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleImportFile} />
        <button type="button" onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2">
          <Download className="h-3.5 w-3.5" /> Exportar
        </button>
        <button
          type="button"
          onClick={handleBulkDelete}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 text-negative disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Excluir selecionados
        </button>
      </div>

      {data && (
        <div className="rounded-2xl bg-surface border border-border p-4 flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Total do período filtrado</span>
          <span className={clsx("text-lg font-semibold", data.totalAmount >= 0 ? "text-positive" : "text-negative")}>
            {formatCurrency(data.totalAmount)}
          </span>
        </div>
      )}

      {/* Tabela */}
      <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted border-b border-border">
              <th className="p-2.5 w-8">
                <input
                  type="checkbox"
                  checked={!!data && data.items.length > 0 && selected.size === data.items.length}
                  onChange={toggleAll}
                  className="h-4 w-4"
                />
              </th>
              <th className="p-2.5">Data evento</th>
              <th className="p-2.5">Data efetivação</th>
              <th className="p-2.5">Categoria</th>
              <th className="p-2.5">Forma</th>
              <th className="p-2.5">Instituição</th>
              <th className="p-2.5">Cartão</th>
              <th className="p-2.5">Descrição</th>
              <th className="p-2.5 text-right">Valor</th>
              <th className="p-2.5">Status</th>
              <th className="p-2.5 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-surface-muted/60">
                <td className="p-2.5">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleSelected(t.id)} className="h-4 w-4" />
                </td>
                <td className="p-2.5 whitespace-nowrap">{formatDate(t.eventDate)}</td>
                <td className="p-2.5 whitespace-nowrap text-muted">
                  {t.settlementDate ? formatDate(t.settlementDate) : "—"}
                </td>
                <td className="p-2.5 max-w-[220px]">
                  {t.categoryId ? (
                    <span className="text-xs">{categoryPathById[t.categoryId] ?? t.category?.name}</span>
                  ) : (
                    <span className="text-xs text-warning-fg bg-warning-bg rounded px-1.5 py-0.5">Sem categoria</span>
                  )}
                </td>
                <td className="p-2.5 whitespace-nowrap">
                  <span
                    className={clsx(
                      "text-xs rounded-full px-2 py-0.5",
                      t.paymentMethod === "CREDITO" ? "bg-accent/10 text-accent" : "bg-surface-muted text-muted"
                    )}
                  >
                    {PAYMENT_METHOD_LABEL[t.paymentMethod]}
                  </span>
                </td>
                <td className="p-2.5 whitespace-nowrap text-muted">{t.bank?.name ?? "—"}</td>
                <td className="p-2.5 whitespace-nowrap text-muted">{t.creditCardRef?.name ?? "—"}</td>
                <td className="p-2.5 max-w-[240px] truncate">{t.description}</td>
                <td className={clsx("p-2.5 text-right font-medium whitespace-nowrap", t.amount >= 0 ? "text-positive" : "text-negative")}>
                  {formatCurrency(t.amount)}
                </td>
                <td className="p-2.5">
                  <span className={clsx("text-xs rounded-full px-2 py-0.5", STATUS_CLASS[t.status])}>{STATUS_LABEL[t.status]}</span>
                </td>
                <td className="p-2.5">
                  <div className="flex items-center justify-end gap-1">
                    <button type="button" onClick={() => openEdit(t)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-background">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {data && data.items.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-sm text-muted">
                  Nenhum lançamento encontrado para os filtros aplicados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{data.total} lançamento(s)</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-muted">
              Página {data.page}/{data.totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-border disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <TransactionForm
          categories={categories}
          banks={banks}
          creditCards={creditCards}
          initial={editingValues}
          onClose={() => setFormOpen(false)}
          onSubmit={handleSave}
        />
      )}

      {bulkCategorizeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setBulkCategorizeOpen(false)} />
          <div className="relative bg-surface border border-border rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm p-5 flex flex-col gap-4">
            <h2 className="text-lg font-semibold text-foreground">
              Editar categoria de {selected.size} lançamento(s)
            </h2>
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">Sem categoria</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setBulkCategorizeOpen(false)} className="text-sm text-muted px-3 py-2">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmBulkCategorize}
                className="rounded-lg bg-accent text-accent-foreground text-sm font-medium px-4 py-2"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
