import type { BudgetInfo } from "@/lib/analytics/budgetPace";

const COLOR: Record<BudgetInfo["state"], string> = {
  OK: "var(--accent)",
  WARNING: "var(--warning-fg)",
  OVER: "var(--negative)",
};

const LABEL: Record<BudgetInfo["state"], string> = {
  OK: "dentro do orçamento",
  WARNING: "atenção ao ritmo",
  OVER: "acima do orçamento",
};

/**
 * Anel de progresso do orçamento: enche até 100% do planejado e muda de cor
 * pelo estado (normal, atenção, estourado). Acima de 100% fica cheio e vermelho.
 */
export function BudgetRing({ budget, size = 32 }: { budget: BudgetInfo; size?: number }) {
  const stroke = size >= 40 ? 4 : 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.min(100, Math.max(0, budget.usedPct)) / 100;
  const showText = size >= 36;
  const pctText = `${Math.round(budget.usedPct)}%`;

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${pctText} do orçamento usado, ${LABEL[budget.state]}`}
      title={`${pctText} do planejado · ${budget.reason}`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-muted)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COLOR[budget.state]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled * c} ${c}`}
        />
      </svg>
      {showText && (
        <span className="absolute text-[10px] font-semibold tabular-nums" style={{ color: COLOR[budget.state] }}>
          {pctText}
        </span>
      )}
    </span>
  );
}
