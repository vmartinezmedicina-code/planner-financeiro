import { Car, GraduationCap, Home, LifeBuoy, Plane, ShoppingBag, Target, TrendingUp, Wallet, type LucideIcon } from "lucide-react";

export const GOAL_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "TRAVEL", label: "Viagem", icon: Plane },
  { value: "PURCHASE", label: "Compra", icon: ShoppingBag },
  { value: "EMERGENCY_RESERVE", label: "Reserva de emergência", icon: LifeBuoy },
  { value: "EDUCATION", label: "Educação", icon: GraduationCap },
  { value: "HOME", label: "Casa", icon: Home },
  { value: "VEHICLE", label: "Veículo", icon: Car },
  { value: "INVESTMENT", label: "Investimento", icon: TrendingUp },
  { value: "DEBT_REPAYMENT", label: "Quitar dívida", icon: Wallet },
  { value: "OTHER", label: "Outra", icon: Target },
];

export const GOAL_TYPE_LABEL = Object.fromEntries(GOAL_TYPES.map((t) => [t.value, t.label])) as Record<string, string>;

export const STRATEGIES = [
  { value: "SAVE", label: "Guardar" },
  { value: "INVEST", label: "Investir" },
  { value: "SPEND_PLAN", label: "Planejar o gasto" },
  { value: "MIXED", label: "Combinação" },
];
export const STRATEGY_LABEL = Object.fromEntries(STRATEGIES.map((s) => [s.value, s.label])) as Record<string, string>;

export const PRIORITIES = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
];
export const PRIORITY_LABEL = Object.fromEntries(PRIORITIES.map((p) => [p.value, p.label])) as Record<string, string>;

export const CONTRIBUTION_SOURCES = [
  { value: "SAVINGS", label: "Economia do mês" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "INVESTMENT", label: "Investimento" },
  { value: "MANUAL", label: "Outro" },
];
export const CONTRIBUTION_SOURCE_LABEL = Object.fromEntries(CONTRIBUTION_SOURCES.map((c) => [c.value, c.label])) as Record<string, string>;

/** "2027-07-31T..." → "jul/2027" */
export function monthYearLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", month: "short", year: "numeric" }).replace(". de ", "/").replace(" de ", "/").replace(".", "");
}

/** Cor do peso no fluxo livre: até 50% tranquilo, até 80% atenção, acima disso pesado. */
export function shareTone(pct: number | null): "muted" | "warning" | "negative" {
  if (pct === null) return "muted";
  if (pct > 80) return "negative";
  if (pct > 50) return "warning";
  return "muted";
}
