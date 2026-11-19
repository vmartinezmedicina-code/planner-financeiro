"use client";

import { useId } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";

export type ChoiceOption = { value: string; label: string; color?: string; hint?: string };

/**
 * Escolha única em botões (como alternativas de uma pergunta), no lugar de uma
 * lista de seta. Setas do teclado movem entre as opções.
 */
export function ChoiceChips({
  label,
  options,
  value,
  onChange,
  emptyText,
  allowClear = false,
  clearLabel = "Nenhum",
  columns,
}: {
  label: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  /** Mostrado quando não há opções (ex.: nenhum banco cadastrado). */
  emptyText?: React.ReactNode;
  /** Mostra uma opção para deixar sem valor. */
  allowClear?: boolean;
  clearLabel?: string;
  /** Força um número fixo de colunas; padrão: os botões se ajustam ao texto. */
  columns?: 2 | 3 | 4;
}) {
  const labelId = useId();
  const all: ChoiceOption[] = allowClear ? [{ value: "", label: clearLabel }, ...options] : options;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) || all.length === 0) return;
    e.preventDefault();
    const idx = Math.max(0, all.findIndex((o) => o.value === value));
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = all[(idx + step + all.length) % all.length];
    onChange(next.value);
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button[role=radio]");
    buttons[all.indexOf(next)]?.focus();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted" id={labelId}>
        {label}
      </span>
      {options.length === 0 && emptyText ? (
        <span className="text-[11px] text-muted">{emptyText}</span>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          onKeyDown={onKeyDown}
          className={clsx(
            "gap-1.5",
            columns ? `grid ${columns === 2 ? "grid-cols-2" : columns === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}` : "flex flex-wrap"
          )}
        >
          {all.map((o) => {
            const selected = o.value === value;
            return (
              <button
                key={o.value || "__empty__"}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected || (!value && o === all[0]) ? 0 : -1}
                onClick={() => onChange(o.value)}
                title={o.hint}
                className={clsx(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition min-h-[40px]",
                  selected
                    ? "bg-accent text-accent-foreground border-accent"
                    : "border-border text-foreground bg-surface hover:bg-surface-muted",
                  !o.value && !selected && "text-muted"
                )}
              >
                {o.color && <span className="h-2.5 w-2.5 rounded-full shrink-0 ring-1 ring-black/10" style={{ backgroundColor: o.color }} />}
                <span className="truncate">{o.label}</span>
                {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
