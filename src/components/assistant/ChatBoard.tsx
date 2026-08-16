"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Sparkles } from "lucide-react";
import { clsx } from "clsx";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Como está meu saldo esse mês?",
  "Onde eu poderia cortar gastos?",
  "Minha fatura de cartão está dentro do esperado?",
  "Como está a rentabilidade dos meus investimentos?",
];

export function ChatBoard() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Erro ao consultar o assistente.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: json.reply }]);
    } catch {
      setError("Não foi possível conectar ao assistente.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] sm:h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-9 w-9 rounded-xl bg-accent flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-accent-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Assistente Financeiro</h1>
          <p className="text-xs text-muted">Converse sobre seus planos, gastos e investimentos</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto rounded-2xl border border-border bg-surface p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
            <Bot className="h-8 w-8 text-muted" />
            <p className="text-sm text-muted max-w-xs">
              Pergunte sobre seu saldo, categorias de gasto, faturas de cartão ou investimentos. O assistente usa os
              dados já cadastrados no app.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-sm">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-sm rounded-lg border border-border bg-surface-muted px-3 py-2 hover:bg-background transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={clsx("flex gap-2.5", m.role === "user" && "flex-row-reverse")}>
            <div
              className={clsx(
                "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
                m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
              )}
            >
              {m.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
            </div>
            <div
              className={clsx(
                "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                m.role === "user" ? "bg-accent text-accent-foreground" : "bg-surface-muted text-foreground"
              )}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="h-7 w-7 rounded-full flex items-center justify-center bg-surface-muted text-foreground shrink-0">
              <Bot className="h-3.5 w-3.5" />
            </div>
            <div className="rounded-2xl px-3.5 py-2.5 bg-surface-muted flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pensando...
            </div>
          </div>
        )}

        {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 mt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo sobre suas finanças..."
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="h-10 w-10 flex items-center justify-center rounded-xl bg-accent text-accent-foreground disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
