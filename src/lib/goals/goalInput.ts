import { z } from "zod";
import { GoalPriority, GoalStrategy, GoalType } from "@prisma/client";

const money = z.number().nonnegative().max(1_000_000_000);

/** Entrada da API de metas (valores em reais; o servidor converte para centavos). */
export const goalInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).nullable().optional(),
  type: z.nativeEnum(GoalType).default(GoalType.OTHER),
  strategy: z.nativeEnum(GoalStrategy).default(GoalStrategy.SAVE),
  priority: z.nativeEnum(GoalPriority).default(GoalPriority.MEDIUM),
  targetAmount: money.refine((v) => v > 0, "Informe o valor desejado."),
  initialAmount: money.default(0),
  targetDate: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable().optional(),
  monthlyPlan: money.nullable().optional(),
  linkedBankId: z.string().nullable().optional(),
  linkedInvestmentId: z.string().nullable().optional(),
});

/** "2027-07" vira o último dia de julho; "2027-07-15" fica como está. */
export function parseTargetDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}$/.test(v)) {
    const [y, m] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0));
  }
  return new Date(`${v}T00:00:00.000Z`);
}
