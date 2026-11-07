"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";

export function AccountBoard({ name, email }: { name: string; email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next !== confirm) {
      setMsg({ ok: false, text: "A confirmação não confere com a nova senha." });
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: "Senha alterada com sucesso." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } else {
      setMsg({ ok: false, text: json.error ?? "Não foi possível alterar a senha." });
    }
  }

  const input =
    "w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-accent";

  return (
    <div className="flex flex-col gap-5 max-w-md">
      <h1 className="text-xl font-semibold text-foreground">Conta e segurança</h1>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted">{email}</p>
      </section>

      <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <KeyRound className="h-4 w-4" /> Trocar senha
        </h2>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Senha atual
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Nova senha (mínimo 10 caracteres)
          <input type="password" autoComplete="new-password" required minLength={10} value={next} onChange={(e) => setNext(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Confirmar nova senha
          <input type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
        </label>
        {msg && <p className={msg.ok ? "text-xs text-positive" : "text-xs text-negative"}>{msg.text}</p>}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-accent text-accent-foreground text-sm font-medium px-4 py-2 disabled:opacity-60"
        >
          {busy ? "Salvando..." : "Alterar senha"}
        </button>
      </form>

      <p className="text-xs text-muted">
        Após 5 tentativas erradas de login, a conta fica bloqueada por 15 minutos.
      </p>
    </div>
  );
}
