"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { AlertTriangle, Camera, CheckCircle2, FileText, Loader2, Trash2, Upload, XCircle } from "lucide-react";
import { ChoiceChips } from "@/components/ui/ChoiceChips";
import { addMonths, referenceFor } from "@/lib/invoices/invoicePeriod";
import { shortMonthLabel, todayAsUtcDate } from "@/lib/format";
import { isImage, prepareFile, PrepareError } from "./prepareFile";

type Account = { id: string; name: string; color?: string | null };
type Card = Account & { closingDay: number | null; dueDay: number | null };
export type ImportListItem = {
  id: string;
  target: string;
  status: string;
  accountName: string;
  invoiceLabel: string | null;
  itemCount: number;
  fileCount: number;
  createdAt: string;
};

type FileState = { key: string; file: File; status: "waiting" | "reading" | "done" | "error"; added?: number; message?: string };

const CONCURRENCY = 3;

export function ImportStart({
  banks,
  cards,
  members,
  defaultMemberId,
  aiEnabled,
  recent,
}: {
  banks: Account[];
  cards: Card[];
  members: { id: string; name: string }[];
  defaultMemberId: string | null;
  aiEnabled: boolean;
  recent: ImportListItem[];
}) {
  const router = useRouter();
  const [target, setTarget] = useState<"CARD" | "BANK">(cards.length > 0 ? "CARD" : "BANK");
  const [cardId, setCardId] = useState(cards.length === 1 ? cards[0].id : "");
  const [bankId, setBankId] = useState(banks.length === 1 ? banks[0].id : "");
  const [invoice, setInvoice] = useState("");
  const [future, setFuture] = useState(true);
  const [memberId, setMemberId] = useState(defaultMemberId ?? "");
  const [files, setFiles] = useState<FileState[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const card = cards.find((c) => c.id === cardId) ?? null;

  // Faturas sugeridas: a atual (onde cai uma compra feita hoje), duas anteriores e a próxima.
  const invoiceOptions = useMemo(() => {
    if (!card) return [];
    const cur = referenceFor(card, todayAsUtcDate());
    return [-2, -1, 0, 1].map((delta) => {
      const r = addMonths(cur.year, cur.month, delta);
      return { value: `${r.year}-${r.month}`, label: `Fatura ${shortMonthLabel(r.year, r.month)}`, hint: delta === 0 ? "atual" : undefined };
    });
  }, [card]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: "waiting" as const }));
    setFiles((prev) => [...prev, ...next]);
    setError(null);
  }

  const needsAi = files.some((f) => !/\.csv$/i.test(f.file.name));
  const accountReady = target === "CARD" ? !!cardId : !!bankId;
  const canStart = accountReady && files.length > 0 && !running && (aiEnabled || !needsAi);

  async function start() {
    if (!canStart) return;
    setRunning(true);
    setError(null);
    const [y, m] = invoice ? invoice.split("-").map(Number) : [0, 0];
    const res = await fetch("/api/imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target,
        creditCardId: target === "CARD" ? cardId : null,
        bankId: target === "BANK" ? bankId : null,
        memberId: memberId || null,
        invoiceRef: target === "CARD" && invoice ? { year: y, month: m } : null,
        createFutureParcels: future,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Não foi possível iniciar a importação.");
      setRunning(false);
      return;
    }
    const id: string = json.id;

    const queue = files.map((f, index) => ({ ...f, index }));
    let ok = 0;
    const update = (key: string, patch: Partial<FileState>) => setFiles((prev) => prev.map((f) => (f.key === key ? { ...f, ...patch } : f)));

    async function worker() {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const f = next;
        update(f.key, { status: "reading", message: undefined });
        try {
          const prepared = await prepareFile(f.file);
          const form = new FormData();
          // Nome único por arquivo (fotos da câmera costumam vir todas como "image.jpg").
          form.append("file", prepared, `${String(f.index + 1).padStart(2, "0")}-${prepared.name}`);
          form.append("index", String(f.index));
          const r = await fetch(`/api/imports/${id}/files`, { method: "POST", body: form });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error ?? "Erro ao ler o arquivo.");
          ok++;
          update(f.key, { status: "done", added: j.added, message: (j.warnings ?? []).join(" ") || undefined });
        } catch (e) {
          update(f.key, { status: "error", message: e instanceof PrepareError || e instanceof Error ? e.message : "Erro ao ler o arquivo." });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));

    if (ok === 0) {
      setError("Nenhum arquivo foi lido. Confira os erros acima e tente de novo.");
      await fetch(`/api/imports/${id}`, { method: "DELETE" });
      setRunning(false);
      return;
    }
    await fetch(`/api/imports/${id}/dedupe`, { method: "POST" });
    router.push(`/lancamentos/importar/${id}`);
  }

  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Importar fatura ou extrato</h1>
          <p className="text-xs text-muted">PDF, fotos/prints ou CSV. Nada é lançado antes de você conferir.</p>
        </div>
        <Link href="/lancamentos" className="text-xs font-medium text-accent hover:underline">
          Voltar para Lançamentos
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-4">
        <ChoiceChips
          label="De onde é o documento?"
          value={target}
          onChange={(v) => setTarget(v as "CARD" | "BANK")}
          options={[
            { value: "CARD", label: "Cartão de crédito" },
            { value: "BANK", label: "Conta bancária" },
          ]}
        />

        {target === "CARD" ? (
          <>
            <ChoiceChips
              label="Cartão"
              value={cardId}
              onChange={(v) => {
                setCardId(v);
                setInvoice("");
              }}
              options={cards.map((c) => ({ value: c.id, label: c.name, color: c.color ?? undefined }))}
              emptyText={
                <>
                  Nenhum cartão cadastrado. <Link href="/cartoes" className="text-accent underline">Cadastre em Cartões</Link> (com o dia de fechamento).
                </>
              }
            />
            {card && (
              <>
                <ChoiceChips
                  label="Qual fatura?"
                  value={invoice}
                  onChange={setInvoice}
                  allowClear
                  clearLabel="Pela data de cada compra"
                  options={invoiceOptions}
                />
                {!card.closingDay && (
                  <p className="flex items-start gap-1.5 text-[11px] text-warning-fg">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> Este cartão está sem dia de fechamento. Escolha a fatura acima ou cadastre o fechamento em Cartões.
                  </p>
                )}
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={future} onChange={(e) => setFuture(e.target.checked)} className="mt-0.5" />
                  <span>
                    Lançar as próximas parcelas das compras parceladas
                    <span className="block text-muted">Ex.: parcela 3/10 nesta fatura → parcelas 4 a 10 já entram nas faturas seguintes.</span>
                  </span>
                </label>
              </>
            )}
          </>
        ) : (
          <ChoiceChips
            label="Conta"
            value={bankId}
            onChange={setBankId}
            options={banks.map((b) => ({ value: b.id, label: b.name, color: b.color ?? undefined }))}
            emptyText={
              <>
                Nenhuma conta cadastrada. <Link href="/bancos" className="text-accent underline">Cadastre em Bancos</Link>.
              </>
            }
          />
        )}

        {members.length > 1 && (
          <ChoiceChips
            label="De quem são os gastos?"
            value={memberId}
            onChange={setMemberId}
            allowClear
            clearLabel="Da família"
            options={members.map((m) => ({ value: m.id, label: m.name }))}
          />
        )}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 hover:bg-surface-muted disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" /> Escolher arquivos
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={running}
            className="flex items-center gap-1.5 rounded-lg border border-border text-xs font-medium px-3 py-2 hover:bg-surface-muted disabled:opacity-50 sm:hidden"
          >
            <Camera className="h-3.5 w-3.5" /> Tirar foto
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.csv,text/csv"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        <p className="text-[11px] text-muted">
          Pode enviar vários de uma vez (ex.: 30 prints da fatura). Itens que aparecem em mais de um print são marcados como repetidos.
          {!aiEnabled && " A leitura de PDF e fotos precisa da chave da IA (ANTHROPIC_API_KEY); CSV funciona sem ela."}
        </p>

        {files.length > 0 && (
          <ul className="flex flex-col divide-y divide-border">
            {files.map((f) => (
              <li key={f.key} className="py-2 flex items-start gap-2 text-xs">
                <span className="mt-0.5">
                  {f.status === "reading" ? (
                    <Loader2 className="h-4 w-4 animate-spin text-accent" />
                  ) : f.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-positive" />
                  ) : f.status === "error" ? (
                    <XCircle className="h-4 w-4 text-negative" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted" />
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate">{f.file.name}</span>
                  <span className={clsx("block", f.status === "error" ? "text-negative" : "text-muted")}>
                    {f.status === "waiting" && (isImage(f.file) ? "Foto" : /\.csv$/i.test(f.file.name) ? "CSV" : "PDF")}
                    {f.status === "reading" && "Lendo…"}
                    {f.status === "done" && `${f.added} ite${f.added === 1 ? "m" : "ns"} encontrado${f.added === 1 ? "" : "s"}`}
                    {f.message && (f.status === "done" ? ` · ${f.message}` : f.message)}
                  </span>
                </span>
                {!running && f.status !== "done" && (
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
                    aria-label={`Remover ${f.file.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-xs text-negative">{error}</p>}
        {!aiEnabled && needsAi && <p className="text-xs text-negative">Sem a chave da IA, só arquivos CSV podem ser lidos.</p>}

        <div>
          <button
            type="button"
            onClick={start}
            disabled={!canStart}
            className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium px-4 py-2 disabled:opacity-50"
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            {running
              ? `Lendo ${files.filter((f) => f.status === "done" || f.status === "error").length}/${files.length}…`
              : `Ler ${files.length || ""} arquivo${files.length === 1 ? "" : "s"} e conferir`}
          </button>
          {!accountReady && files.length > 0 && <p className="mt-1 text-[11px] text-muted">Escolha {target === "CARD" ? "o cartão" : "a conta"} primeiro.</p>}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Importações recentes</h2>
          <ul className="rounded-2xl border border-border bg-surface divide-y divide-border">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/lancamentos/importar/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs hover:bg-surface-muted">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{r.accountName}</span>
                    {r.invoiceLabel ? ` · fatura ${r.invoiceLabel}` : ""} · {r.itemCount} ite{r.itemCount === 1 ? "m" : "ns"} ·{" "}
                    {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </span>
                  <span className={clsx("shrink-0 rounded-full px-2 py-0.5", r.status === "COMPLETED" ? "bg-positive-bg text-positive" : "bg-warning-bg text-warning-fg")}>
                    {r.status === "COMPLETED" ? "Lançada" : "Em conferência"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
