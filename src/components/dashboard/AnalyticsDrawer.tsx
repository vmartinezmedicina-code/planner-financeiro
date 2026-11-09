"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Painel de detalhe do dashboard: lateral no computador, folha inferior no
 * celular. Abre por cima da tela (não empurra o conteúdo) e fecha com Esc,
 * clique fora ou no X.
 */
export function AnalyticsDrawer({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] rounded-t-2xl sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 sm:max-h-none sm:h-full sm:w-[440px] sm:rounded-none sm:rounded-l-2xl bg-surface border border-border shadow-xl flex flex-col">
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground truncate">{title}</h2>
            {subtitle && <p className="text-xs text-muted truncate">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="h-8 w-8 shrink-0 flex items-center justify-center rounded-full hover:bg-surface-muted"
            aria-label="Fechar painel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
