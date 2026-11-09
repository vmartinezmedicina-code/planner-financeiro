import { clsx } from "clsx";
import { MONTH_NAMES } from "@/lib/format";
import { formatCents } from "@/lib/money";

/**
 * Tendência de 6 meses em barras simples (CSS). O último mês é o selecionado
 * e fica destacado. Clicar em uma barra abre aquele mês.
 */
export function TrendChart({
  points,
  onSelect,
}: {
  points: { year: number; month: number; cents: number }[];
  onSelect?: (year: number, month: number) => void;
}) {
  const max = Math.max(1, ...points.map((p) => Math.abs(p.cents)));
  const hasData = points.some((p) => p.cents !== 0);
  if (!hasData) return <p className="text-xs text-muted">Sem movimento nos últimos 6 meses.</p>;

  return (
    <div className="flex items-end gap-2 h-24" role="img" aria-label="Evolução dos últimos 6 meses">
      {points.map((p, i) => {
        const isCurrent = i === points.length - 1;
        const height = Math.max(p.cents !== 0 ? 6 : 2, Math.round((Math.abs(p.cents) / max) * 100));
        const label = `${MONTH_NAMES[p.month - 1]} de ${p.year}: ${formatCents(p.cents)}`;
        const bar = (
          <>
            <span className="flex-1 w-full flex items-end">
              <span
                className={clsx("block w-full rounded-t", isCurrent ? "bg-accent" : "bg-surface-muted border border-border")}
                style={{ height: `${height}%` }}
              />
            </span>
            <span className={clsx("text-[10px]", isCurrent ? "text-foreground font-medium" : "text-muted")}>
              {MONTH_NAMES[p.month - 1].slice(0, 3)}
            </span>
          </>
        );
        return onSelect && !isCurrent ? (
          <button
            key={`${p.year}-${p.month}`}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onSelect(p.year, p.month)}
            className="flex-1 h-full flex flex-col items-center gap-1 hover:opacity-80"
          >
            {bar}
          </button>
        ) : (
          <div key={`${p.year}-${p.month}`} title={label} className="flex-1 h-full flex flex-col items-center gap-1">
            {bar}
          </div>
        );
      })}
    </div>
  );
}
