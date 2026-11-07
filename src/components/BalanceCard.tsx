import { clsx } from "clsx";
import { formatCurrency } from "@/lib/format";

export function BalanceCard({ label, value }: { label: string; value: number }) {
  // Zero é neutro: só fica verde/vermelho quando há saldo de fato.
  const tone = value > 0.004 ? "positive" : value < -0.004 ? "negative" : "neutral";
  return (
    <div
      className={clsx(
        "rounded-2xl border p-5 flex flex-col gap-1",
        tone === "positive" && "bg-positive-bg border-positive/20",
        tone === "negative" && "bg-negative-bg border-negative/20",
        tone === "neutral" && "bg-surface border-border"
      )}
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <span
        className={clsx(
          "text-2xl font-semibold",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "neutral" && "text-foreground"
        )}
      >
        {formatCurrency(value)}
      </span>
    </div>
  );
}
