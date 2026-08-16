import { clsx } from "clsx";
import { formatCurrency } from "@/lib/format";

export function BalanceCard({ label, value }: { label: string; value: number }) {
  const positive = value >= 0;
  return (
    <div
      className={clsx(
        "rounded-2xl border p-5 flex flex-col gap-1",
        positive ? "bg-positive-bg border-positive/20" : "bg-negative-bg border-negative/20"
      )}
    >
      <span className="text-xs font-medium text-muted">{label}</span>
      <span className={clsx("text-2xl font-semibold", positive ? "text-positive" : "text-negative")}>
        {formatCurrency(value)}
      </span>
    </div>
  );
}
