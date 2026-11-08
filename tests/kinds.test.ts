import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  deriveKind,
  isConsumption,
  affectsBankBalance,
  normalizeSign,
  resolveLinksForKind,
  paymentMethodForKind,
  TRANSACTION_KINDS,
} from "../src/lib/finance/kinds";

describe("deriveKind (compatibilidade V1)", () => {
  test("crédito vira compra no cartão independentemente do sinal", () => {
    assert.equal(deriveKind("CREDITO", -1000), "CARD_PURCHASE");
    assert.equal(deriveKind("CREDITO", 1000), "CARD_PURCHASE");
  });
  test("débito/pix/dinheiro viram receita ou despesa pelo sinal", () => {
    assert.equal(deriveKind("DEBITO", 500), "INCOME");
    assert.equal(deriveKind("PIX", -500), "EXPENSE");
    assert.equal(deriveKind("DINHEIRO", 0), "INCOME");
  });
});

describe("classificação", () => {
  test("só receita, despesa e compra no cartão entram no BI de consumo", () => {
    assert.deepEqual(
      TRANSACTION_KINDS.filter(isConsumption),
      ["INCOME", "EXPENSE", "CARD_PURCHASE"]
    );
  });
  test("compra no cartão não mexe no saldo da conta; pagamento de fatura e transferência mexem", () => {
    assert.equal(affectsBankBalance("CARD_PURCHASE"), false);
    assert.equal(affectsBankBalance("CARD_PAYMENT"), true);
    assert.equal(affectsBankBalance("TRANSFER"), true);
    assert.equal(affectsBankBalance("ADJUSTMENT"), true);
  });
});

describe("normalizeSign", () => {
  test("despesas e compras são sempre negativas, receitas positivas", () => {
    assert.equal(normalizeSign("EXPENSE", 5000), -5000);
    assert.equal(normalizeSign("CARD_PURCHASE", 5000), -5000);
    assert.equal(normalizeSign("CARD_PAYMENT", 5000), -5000);
    assert.equal(normalizeSign("INCOME", -5000), 5000);
  });
  test("transferência e ajuste mantêm o sinal informado", () => {
    assert.equal(normalizeSign("TRANSFER", -5000), -5000);
    assert.equal(normalizeSign("TRANSFER", 5000), 5000);
    assert.equal(normalizeSign("ADJUSTMENT", -1), -1);
  });
});

describe("resolveLinksForKind", () => {
  test("compra no cartão nunca aponta para conta", () => {
    assert.deepEqual(resolveLinksForKind("CARD_PURCHASE", "bank1", "card1"), { bankId: null, creditCardId: "card1" });
  });
  test("pagamento de fatura guarda conta e cartão", () => {
    assert.deepEqual(resolveLinksForKind("CARD_PAYMENT", "bank1", "card1"), { bankId: "bank1", creditCardId: "card1" });
  });
  test("demais tipos nunca apontam para cartão", () => {
    for (const k of ["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"] as const) {
      assert.deepEqual(resolveLinksForKind(k, "bank1", "card1"), { bankId: "bank1", creditCardId: null });
    }
  });
});

describe("paymentMethodForKind", () => {
  test("mantém o campo legado coerente", () => {
    assert.equal(paymentMethodForKind("CARD_PURCHASE", "DEBITO"), "CREDITO");
    assert.equal(paymentMethodForKind("EXPENSE", "PIX"), "PIX");
    assert.equal(paymentMethodForKind("EXPENSE", "CREDITO"), "DEBITO");
    assert.equal(paymentMethodForKind("TRANSFER", undefined), "PIX");
  });
});
