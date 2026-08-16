import { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DEBITO: "Débito",
  CREDITO: "Crédito",
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
};

/**
 * Garante, no servidor, que um lançamento nunca aponte para banco E cartão
 * ao mesmo tempo — a regra de negócio central do módulo de Lançamentos:
 *
 * - CREDITO  -> vai para a fatura do cartão (creditCardId). NUNCA mexe no
 *               saldo do banco (bankId sempre null).
 * - DEBITO / PIX / DINHEIRO -> sai direto do saldo do banco (bankId).
 *               NUNCA entra em fatura de cartão (creditCardId sempre null).
 *
 * Isso é reforçado aqui (e não só na tela) para que a integridade não
 * dependa do cliente enviar os campos certos.
 */
export function resolvePaymentLinks(
  paymentMethod: PaymentMethod,
  bankId: string | null,
  creditCardId: string | null
): { bankId: string | null; creditCardId: string | null } {
  if (paymentMethod === "CREDITO") {
    return { bankId: null, creditCardId };
  }
  return { bankId, creditCardId: null };
}
