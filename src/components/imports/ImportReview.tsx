"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Undo2 } from "lucide-react";
import { formatCents } from "@/lib/money";
import { formatDayMonth, shortMonthLabel, toDateInputValue } from "@/lib/format";
import { addMonths, referenceFor } from "@/lib/invoices/invoicePeriod";
import type { CategoryOption } from "@/lib/categories";
import type { ImportItemView, ImportView } from "@/lib/imports/importService";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { CategoryPicker } from "@/components/ui/CategoryPicker";

type Filter = "ALL" | "INCLUDED" | "FLAGGED" | "NOCAT";

const DUP_BADGE: Record<string, { text: string; cls: string }> = {
  LIKELY: { text: "Já lançado", cls: "bg-negative-bg text-negative" },
  POSSIBLE: { text: "Possível duplicado", cls: "bg-warning-bg text-warning-fg" },
  REPEATED: { text: "Repetido", cls: "bg-surface-muted text-muted" },
};

const KIND_TEXT: Record<string, string> = {
  REFUND: "Estorno",
  FEE: "Tarifa/encargo",
  BILL_PAYMENT: "Pagamento de fatura",
  OWN_TRANSFER: "Transferência",
  INVESTMENT: "Investimento",
};

function itemKey(desc: string): string {
  return desc.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function ImportReview({
  initial,
  categories,
  members,
  card,
}: {
  initial: ImportView;
  categories: CategoryOption[];
  members: { id: string; name: string }[];
  card: { closingDay: number | null; dueDay: number | null } | null;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const editable = view.status === "REVIEW";
  const labelById = useMemo(() => new Map(categories.map((c) => [c.id, c.label])), [categories]);

  const invoiceOptions = useMemo(() => {
    if (!card) return [];
    const cur = referenceFor(card, new Date(view.createdAt));
    const opts = [-2, -1, 0, 1].map((delta) => addMonths(cur.year, cur.month, delta));
    if (view.invoiceRef && !opts.some((o) => o.year === view.invoiceRef!.year && o.month === view.invoiceRef!.month)) opts.push(view.invoiceRef);
    return opts.map((r) => ({ value: `${r.year}-${r.month}`, label: `Fatura ${shortMonthLabel(r.year, r.month)}` }));
  }, [card, view.createdAt, view.invoiceRef]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/imports/${view.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setMessage({ tone: "error", text: json.error ?? "Não foi possível salvar." });
      return false;
    }
    setView(json);
    return true;
  }

  function toggle(item: ImportItemView) {
    if (!editable || item.locked) return;
    setView((v) => ({ ...v, items: v.items.map((i) => (i.id === item.id ? { ...i, include: !i.include } : i)) }));
    void patch({ items: [{ id: item.id, include: !item.include }] });
  }

  function setAll(include: boolean) {
    const ids = visible.filter((i) => !i.locked && i.include !== include).map((i) => i.id);
    if (ids.length) void patch({ items: ids.map((id) => ({ id, include })) });
  }

  async function commit() {
    setBusy("commit");
    setMessage(null);
    let total = 0;
    try {
      for (let guard = 0; guard < 100; guard++) {
        const res = await fetch(`/api/imports/${view.id}/commit`, { method: "POST" });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Erro ao lançar.");
        total += json.created;
        if (json.remaining === 0) break;
      }
      setMessage({ tone: "ok", text: `${total} ite${total === 1 ? "m lançado" : "ns lançados"}.` });
    } catch (e) {
      setMessage({ tone: "error", text: `${e instanceof Error ? e.message : "Erro ao lançar."}${total ? ` (${total} já lançados; clique de novo para continuar)` : ""}` });
    }
    const fresh = await fetch(`/api/imports/${view.id}`).then((r) => r.json());
    setView(fresh);
    setBusy(null);
    router.refresh();
  }

  async function undo() {
    if (!confirm("Desfazer esta importação? Todos os lançamentos criados por ela (inclusive parcelas futuras) serão excluídos.")) return;
    setBusy("undo");
    const res = await fetch(`/api/imports/${view.id}/undo`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessage({ tone: "ok", text: `${json.deleted} lançamento(s) removido(s). A importação voltou para a conferência.` });
      setView(await fetch(`/api/imports/${view.id}`).then((r) => r.json()));
    } else setMessage({ tone: "error", text: json.error ?? "Erro ao desfazer." });
    setBusy(null);
  }

  async function discard() {
    if (!confirm("Excluir esta importação? Nada foi lançado; os itens lidos serão descartados.")) return;
    setBusy("discard");
    const res = await fetch(`/api/imports/${view.id}`, { method: "DELETE" });
    if (res.ok) router.push("/lancamentos/importar");
    else {
      const json = await res.json().catch(() => ({}));
      setMessage({ tone: "error", text: json.error ?? "Erro ao excluir." });
      setBusy(null);
    }
  }

  const visible = view.items.filter((i) =>
    filter === "INCLUDED" ? i.include : filter === "FLAGGED" ? i.duplicateStatus !== "NEW" || i.locked : filter === "NOCAT" ? i.include && !i.categoryId : true
  );
  const t = view.totals;
  const statementDiff = view.target === "CARD" && view.statementTotalCents ? view.statementTotalCents + t.netCents : null;
  const counts = {
    INCLUDED: view.items.filter((i) => i.include).length,
    FLAGGED: view.items.filter((i) => i.duplicateStatus !== "NEW" || i.locked).length,
    NOCAT: view.items.filter((i) => i.include && !i.categoryId).length,
  };

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{editable ? "Conferir importação" : "Importação lançada"}</h1>
          <p className="text-xs text-muted">
            {view.target === "CARD" ? "Cartão" : "Conta"} <strong className="text-foreground">{view.accountName}</strong>
            {view.target === "CARD" && (view.invoiceLabel ? ` · fatura ${view.invoiceLabel}` : " · fatura pela data de cada compra")} · {view.fileCount} arquivo
            {view.fileCount === 1 ? "" : "s"}
            {view.detectedInstitution ? ` · lido como ${view.detectedInstitution}` : ""}
          </p>
        </div>
        <Link href="/lancamentos/importar" className="text-xs font-medium text-accent hover:underline">
          Nova importação
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label={editable ? "Vão ser lançados" : "Lançados"} value={`${t.included} ite${t.included === 1 ? "m" : "ns"}`} sub={t.futureParcels ? `+ ${t.futureParcels} parcelas futuras` : undefined} />
        <Stat label={view.target === "CARD" ? "Compras" : "Saídas"} value={formatCents(t.outCents)} tone="negative" />
        <Stat label={view.target === "CARD" ? "Estornos/créditos" : "Entradas"} value={formatCents(t.inCents)} tone="positive" />
        {view.target === "CARD" && view.statementTotalCents ? (
          <Stat
            label="Total do documento"
            value={formatCents(view.statementTotalCents)}
            sub={statementDiff === 0 ? "bate com os itens marcados" : `diferença de ${formatCents(Math.abs(statementDiff!))}`}
            tone={statementDiff === 0 ? "positive" : "warning"}
          />
        ) : (
          <Stat label="Resultado" value={formatCents(t.netCents)} />
        )}
      </div>

      {view.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning-fg flex flex-col gap-1">
          {view.warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {w}
            </p>
          ))}
        </div>
      )}

      {editable && (view.target === "CARD" || members.length > 1) && (
        <details className="rounded-2xl border border-border bg-surface px-4 py-3">
          <summary className="text-xs font-medium cursor-pointer">Fatura, parcelas e membro</summary>
          <div className="mt-3 flex flex-col gap-3">
            {view.target === "CARD" && (
              <>
                <ChoiceChips
                  label="Fatura"
                  value={view.invoiceRef ? `${view.invoiceRef.year}-${view.invoiceRef.month}` : ""}
                  onChange={(v) => {
                    const [year, month] = v ? v.split("-").map(Number) : [0, 0];
                    void patch({ invoiceRef: v ? { year, month } : null });
                  }}
                  allowClear
                  clearLabel="Pela data de cada compra"
                  options={invoiceOptions}
                />
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={view.createFutureParcels} onChange={(e) => void patch({ createFutureParcels: e.target.checked })} />
                  Lançar as próximas parcelas das compras parceladas
                </label>
              </>
            )}
            {members.length > 1 && (
              <ChoiceChips
                label="De quem são os gastos?"
                value={view.memberId ?? ""}
                onChange={(v) => void patch({ memberId: v || null })}
                allowClear
                clearLabel="Da família"
                options={members.map((m) => ({ value: m.id, label: m.name }))}
              />
            )}
          </div>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar itens">
          {(
            [
              ["ALL", `Todos (${view.items.length})`],
              ["INCLUDED", `Marcados (${counts.INCLUDED})`],
              ["FLAGGED", `Duplicados e avisos (${counts.FLAGGED})`],
              ["NOCAT", `Sem categoria (${counts.NOCAT})`],
            ] as [Filter, string][]
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={clsx("rounded-full px-3 py-1 text-xs border", filter === f ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface-muted")}
            >
              {label}
            </button>
          ))}
        </div>
        {editable && visible.length > 0 && (
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setAll(true)} className="text-accent hover:underline">
              Marcar todos
            </button>
            <button type="button" onClick={() => setAll(false)} className="text-accent hover:underline">
              Desmarcar todos
            </button>
          </div>
        )}
      </div>

      <ul className="rounded-2xl border border-border bg-surface divide-y divide-border">
        {visible.length === 0 && <li className="px-4 py-6 text-center text-xs text-muted">Nenhum item neste filtro.</li>}
        {visible.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            editable={editable}
            open={openId === item.id}
            categoryLabel={item.categoryId ? (labelById.get(item.categoryId) ?? "Categoria removida") : null}
            sessionInvoice={view.invoiceLabel}
            categories={categories}
            categoryType={view.target === "BANK" && item.amountCents > 0 ? "RECEITA" : "DESPESA"}
            onToggle={() => toggle(item)}
            onOpen={() => setOpenId(openId === item.id ? null : item.id)}
            onSave={async (changes) => {
              const items: Record<string, unknown>[] = [{ id: item.id, ...changes }];
              // Categoria escolhida vale para os outros itens iguais desta importação ainda sem escolha manual.
              if (changes.categoryId) {
                const key = itemKey(item.description);
                for (const other of view.items) {
                  if (other.id !== item.id && itemKey(other.description) === key && other.categorySource !== "USER" && Math.sign(other.amountCents) === Math.sign(item.amountCents)) {
                    items.push({ id: other.id, categoryId: changes.categoryId });
                  }
                }
              }
              if (await patch({ items })) setOpenId(null);
            }}
          />
        ))}
      </ul>

      {message && (
        <p className={clsx("text-sm flex items-center gap-1.5", message.tone === "ok" ? "text-positive" : "text-negative")}>
          {message.tone === "ok" && <CheckCircle2 className="h-4 w-4" />} {message.text}
        </p>
      )}

      {/* Fixa no rodapé, exceto durante a edição de um item (para não cobrir o Salvar). */}
      <div className={clsx(!openId && "sticky bottom-16 md:bottom-4", "z-10 rounded-2xl border border-border bg-surface/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-2 shadow-sm")}>
        {editable ? (
          <>
            <button type="button" onClick={discard} disabled={!!busy} className="text-xs text-negative hover:underline disabled:opacity-50">
              Excluir importação
            </button>
            <button
              type="button"
              onClick={commit}
              disabled={!!busy || t.included === 0}
              className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium px-4 py-2 disabled:opacity-50"
            >
              {busy === "commit" && <Loader2 className="h-4 w-4 animate-spin" />}
              Lançar {t.included} ite{t.included === 1 ? "m" : "ns"}
              {t.futureParcels ? ` + ${t.futureParcels} parcelas` : ""}
            </button>
          </>
        ) : (
          <>
            <span className="text-xs text-muted">
              Lançada em {view.completedAt ? new Date(view.completedAt).toLocaleString("pt-BR") : "—"} ·{" "}
              <Link href={view.target === "CARD" ? "/cartoes" : "/lancamentos"} className="text-accent hover:underline">
                ver {view.target === "CARD" ? "faturas" : "lançamentos"}
              </Link>
            </span>
            <button
              type="button"
              onClick={undo}
              disabled={!!busy}
              className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 hover:bg-surface-muted disabled:opacity-50"
            >
              {busy === "undo" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Desfazer importação
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" | "warning" }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-3 flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <span className={clsx("text-base font-semibold tabular-nums", tone === "negative" && "text-negative", tone === "positive" && "text-positive")}>{value}</span>
      {sub && <span className={clsx("text-[11px]", tone === "warning" ? "text-warning-fg" : "text-muted")}>{sub}</span>}
    </div>
  );
}

type Changes = { description?: string; date?: string; amountCents?: number; categoryId?: string | null };

function ItemRow({
  item,
  editable,
  open,
  categoryLabel,
  sessionInvoice,
  categories,
  categoryType,
  onToggle,
  onOpen,
  onSave,
}: {
  item: ImportItemView;
  editable: boolean;
  open: boolean;
  categoryLabel: string | null;
  sessionInvoice: string | null;
  categories: CategoryOption[];
  categoryType: "RECEITA" | "DESPESA";
  onToggle: () => void;
  onOpen: () => void;
  onSave: (changes: Changes) => Promise<void>;
}) {
  const badge = DUP_BADGE[item.duplicateStatus];
  const kindText = KIND_TEXT[item.kindHint];

  return (
    <li className={clsx("px-3 py-2.5", !item.include && "bg-surface-muted/40")}>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={item.include}
          disabled={!editable || item.locked}
          onChange={onToggle}
          className="mt-1 h-4 w-4 shrink-0"
          aria-label={`Lançar ${item.description}`}
        />
        <button type="button" onClick={editable ? onOpen : undefined} className={clsx("flex-1 min-w-0 text-left", editable && "cursor-pointer")} aria-expanded={editable ? open : undefined}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={clsx("text-sm font-medium truncate", !item.include && "text-muted line-through decoration-muted/40")}>
                {item.description}
                {item.installmentNumber && item.installmentTotal ? (
                  <span className="ml-1.5 text-[11px] font-normal text-muted">
                    {item.installmentNumber}/{item.installmentTotal}
                    {item.futureParcels ? ` (+${item.futureParcels})` : ""}
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-muted truncate">
                {formatDayMonth(item.date)}
                {item.originalDescription !== item.description ? ` · ${item.originalDescription}` : ""}
                {item.invoiceLabel && item.invoiceLabel !== sessionInvoice ? ` · fatura ${item.invoiceLabel}` : ""}
              </p>
            </div>
            <span className={clsx("text-sm font-semibold tabular-nums shrink-0", item.amountCents > 0 ? "text-positive" : "text-foreground")}>
              {item.amountCents > 0 ? "+" : ""}
              {formatCents(Math.abs(item.amountCents))}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={clsx("rounded-full px-2 py-0.5", categoryLabel ? "bg-accent/10 text-accent" : "bg-surface-muted text-muted")}>
              {categoryLabel ?? "Sem categoria"}
              {item.categorySource === "HISTORY" && " · pelo histórico"}
              {item.categorySource === "AI" && " · sugerida"}
            </span>
            {kindText && <span className="rounded-full px-2 py-0.5 bg-surface-muted text-muted">{kindText}</span>}
            {badge && <span className={clsx("rounded-full px-2 py-0.5", badge.cls)}>{badge.text}</span>}
            {editable && <ChevronDown className={clsx("h-3.5 w-3.5 text-muted transition-transform", !open && "-rotate-90")} />}
          </div>
          {item.note && <p className="mt-1 text-[11px] text-muted">{item.note}</p>}
        </button>
      </div>

      {open && editable && <ItemEditor item={item} categories={categories} categoryType={categoryType} onCancel={onOpen} onSave={onSave} />}
    </li>
  );
}

function ItemEditor({
  item,
  categories,
  categoryType,
  onCancel,
  onSave,
}: {
  item: ImportItemView;
  categories: CategoryOption[];
  categoryType: "RECEITA" | "DESPESA";
  onCancel: () => void;
  onSave: (changes: Changes) => Promise<void>;
}) {
  // Montado só quando aberto: o estado parte sempre do item atual.
  const [description, setDescription] = useState(item.description);
  const [date, setDate] = useState(toDateInputValue(item.date));
  const [amount, setAmount] = useState((Math.abs(item.amountCents) / 100).toFixed(2).replace(".", ","));
  const [categoryId, setCategoryId] = useState(item.categoryId ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    const cents = Math.round(Number(amount.replace(/\./g, "").replace(",", ".")) * 100);
    if (!cents || cents < 0) return;
    setSaving(true);
    const changes: Changes = {};
    if (description.trim() !== item.description) changes.description = description;
    if (date !== toDateInputValue(item.date)) changes.date = date;
    if (cents !== Math.abs(item.amountCents)) changes.amountCents = Math.sign(item.amountCents) * cents;
    if ((categoryId || null) !== item.categoryId) changes.categoryId = categoryId || null;
    await onSave(changes);
    setSaving(false);
  }

  return (
    <div className="mt-3 ml-6 flex flex-col gap-3 rounded-xl border border-border p-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="flex flex-col gap-1 text-xs sm:col-span-3">
          <span className="font-medium text-muted">Descrição</span>
          <input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted">Data</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-muted">Valor (R$){item.installmentTotal ? " da parcela" : ""}</span>
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm tabular-nums" />
        </label>
      </div>
      <CategoryPicker categories={categories} type={categoryType} value={categoryId} onChange={setCategoryId} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 hover:bg-surface-muted">
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5 disabled:opacity-50">
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Salvar
        </button>
      </div>
    </div>
  );
}
