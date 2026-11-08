/**
 * Semântica de cada tipo de lançamento (TransactionKind). Este módulo é puro
 * (sem Prisma) para que as regras possam ser testadas isoladamente. Os
 * valores do enum são repetidos aqui como union para não depender do client
 * gerado em código de domínio/testes.
 */
export type TransactionKindValue = "INCOME" | "EXPENSE" | "TRANSFER" | "CARD_PURCHASE" | "CARD_PAYMENT" | "ADJUSTMENT";
export type PaymentMethodValue = "DEBITO" | "CREDITO" | "PIX" | "DINHEIRO";

export const TRANSACTION_KINDS: TransactionKindValue[] = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "CARD_PURCHASE",
  "CARD_PAYMENT",
  "ADJUSTMENT",
];

export const KIND_LABEL: Record<TransactionKindValue, string> = {
  INCOME: "Receita",
  EXPENSE: "Despesa",
  TRANSFER: "Transferência",
  CARD_PURCHASE: "Compra no cartão",
  CARD_PAYMENT: "Pagamento de fatura",
  ADJUSTMENT: "Ajuste de saldo",
};

/** Tipos que representam consumo/renda e entram em planejamento, orçamento e BI. */
export const CONSUMPTION_KINDS: TransactionKindValue[] = ["INCOME", "EXPENSE", "CARD_PURCHASE"];

/** Tipos que movimentam o saldo de uma conta bancária. */
export const BANK_BALANCE_KINDS: TransactionKindValue[] = ["INCOME", "EXPENSE", "TRANSFER", "CARD_PAYMENT", "ADJUSTMENT"];

export function isConsumption(kind: TransactionKindValue): boolean {
  return CONSUMPTION_KINDS.includes(kind);
}

export function affectsBankBalance(kind: TransactionKindValue): boolean {
  return BANK_BALANCE_KINDS.includes(kind);
}

/**
 * Deriva o kind de um lançamento "comum" (receita/despesa) a partir da forma
 * de pagamento e do sinal. É a ponte com a V1: CRÉDITO vira CARD_PURCHASE;
 * o resto é INCOME (valor ≥ 0) ou EXPENSE.
 */
export function deriveKind(paymentMethod: PaymentMethodValue, amountCents: number): TransactionKindValue {
  if (paymentMethod === "CREDITO") return "CARD_PURCHASE";
  return amountCents >= 0 ? "INCOME" : "EXPENSE";
}

/** Sinal esperado do valor para cada kind (+1, -1) ou null quando ambos são válidos. */
export function expectedSign(kind: TransactionKindValue): 1 | -1 | null {
  switch (kind) {
    case "INCOME":
      return 1;
    case "EXPENSE":
    case "CARD_PURCHASE":
    case "CARD_PAYMENT":
      return -1;
    default:
      return null; // TRANSFER tem os dois lados; ADJUSTMENT pode ser qualquer um
  }
}

/** Força o sinal do valor conforme o kind (ex.: usuário digitou 50 numa despesa → -5000). */
export function normalizeSign(kind: TransactionKindValue, amountCents: number): number {
  const sign = expectedSign(kind);
  if (sign === null) return amountCents;
  return sign * Math.abs(amountCents);
}

export type PaymentLinks = { bankId: string | null; creditCardId: string | null };

/**
 * Vínculos permitidos por kind (regra central da V1, agora por tipo):
 * - CARD_PURCHASE: só cartão.
 * - CARD_PAYMENT: conta (de onde saiu) e cartão (referência da fatura).
 * - demais: só conta.
 */
export function resolveLinksForKind(kind: TransactionKindValue, bankId: string | null, creditCardId: string | null): PaymentLinks {
  if (kind === "CARD_PURCHASE") return { bankId: null, creditCardId };
  if (kind === "CARD_PAYMENT") return { bankId, creditCardId };
  return { bankId, creditCardId: null };
}

/** Forma de pagamento coerente com o kind (para manter o campo legado preenchido). */
export function paymentMethodForKind(kind: TransactionKindValue, requested: PaymentMethodValue | undefined): PaymentMethodValue {
  if (kind === "CARD_PURCHASE") return "CREDITO";
  if (requested && requested !== "CREDITO") return requested;
  return kind === "TRANSFER" ? "PIX" : "DEBITO";
}
