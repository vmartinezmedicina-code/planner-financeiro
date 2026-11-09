"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Check, Pencil, Plus, Trash2, Users, X } from "lucide-react";

export type Member = { id: string; name: string; color: string; order: number; isActive: boolean; userId: string | null };

const COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#22c55e", "#f59e0b", "#8b5cf6", "#ef4444"];

const input =
  "rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent";

/**
 * Membros da família. Quem tem login já aparece aqui; outros (filhos, "Casa")
 * podem ser criados sem login para indicar a quem um lançamento pertence.
 */
export function MembersSection({ initial }: { initial: Member[] }) {
  const [members, setMembers] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/household/members");
    if (res.ok) setMembers(await res.json());
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/household/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), color: COLORS[members.length % COLORS.length] }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Não foi possível adicionar o membro.");
      return;
    }
    setName("");
    reload();
  }

  async function patch(id: string, data: Partial<Pick<Member, "name" | "isActive">>) {
    setError(null);
    const res = await fetch(`/api/household/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) setError("Não foi possível salvar.");
    setEditingId(null);
    reload();
  }

  async function remove(m: Member) {
    if (!confirm(`Remover "${m.name}"? Os lançamentos ligados a esse membro ficam sem membro.`)) return;
    setError(null);
    const res = await fetch(`/api/household/members/${m.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Não foi possível remover.");
    }
    reload();
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
        <Users className="h-4 w-4" /> Família
      </h2>
      <p className="text-xs text-muted">
        Use os membros para indicar de quem é um gasto ou receita. Não precisam ter login.
      </p>

      <div className="flex flex-col divide-y divide-border">
        {members.map((m) => (
          <div key={m.id} className="py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: m.color }} />
              {editingId === m.id ? (
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") patch(m.id, { name: editName });
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className={clsx(input, "py-1")}
                  maxLength={60}
                />
              ) : (
                <span className={clsx("text-sm truncate", !m.isActive && "text-muted line-through")}>{m.name}</span>
              )}
              {m.userId && <span className="text-[10px] text-accent bg-accent/10 rounded px-1.5 py-0.5 shrink-0">login</span>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {editingId === m.id ? (
                <>
                  <button type="button" onClick={() => patch(m.id, { name: editName })} className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted" aria-label="Salvar nome">
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted" aria-label="Cancelar">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => patch(m.id, { isActive: !m.isActive })}
                    className="text-[11px] text-muted hover:text-foreground px-1.5"
                  >
                    {m.isActive ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(m.id);
                      setEditName(m.name);
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted"
                    aria-label={`Renomear ${m.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  {!m.userId && (
                    <button
                      type="button"
                      onClick={() => remove(m)}
                      className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
                      aria-label={`Remover ${m.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={add} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Novo membro (ex: Helena, Casa)" className={clsx(input, "flex-1")} maxLength={60} />
        <button type="submit" disabled={busy || !name.trim()} className="flex items-center gap-1 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 disabled:opacity-50">
          <Plus className="h-3.5 w-3.5" /> Adicionar
        </button>
      </form>

      {error && <p className="text-xs text-negative">{error}</p>}
    </section>
  );
}
