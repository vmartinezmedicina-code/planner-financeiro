import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  toCents,
  fromCents,
  sumCents,
  splitCents,
  formatCents,
  percentOf,
  percentChange,
  parseBrazilianNumber,
  roundHalfAwayFromZero,
} from "../src/lib/money";

describe("toCents / fromCents", () => {
  test("converte reais em centavos sem erro de ponto flutuante", () => {
    assert.equal(toCents(1234.56), 123456);
    assert.equal(toCents(0.1 + 0.2), 30);
    assert.equal(toCents(1.005), 101);
    assert.equal(toCents(-19.99), -1999);
    assert.equal(toCents(0), 0);
  });
  test("aceita strings no formato brasileiro e internacional", () => {
    assert.equal(toCents("1.234,56"), 123456);
    assert.equal(toCents("1234,56"), 123456);
    assert.equal(toCents("1234.56"), 123456);
    assert.equal(toCents("R$ 2.130,00"), 213000);
    assert.equal(toCents("-12,5"), -1250);
    assert.equal(toCents("1.234"), 123400);
    assert.equal(toCents(""), 0);
    assert.equal(toCents("abc"), 0);
  });
  test("ida e volta preserva o valor", () => {
    for (const v of [0, 0.01, 10, 99.99, 1234.56, -0.5, 1e6]) {
      assert.equal(fromCents(toCents(v)), v);
    }
  });
  test("ignora valores não finitos", () => {
    assert.equal(toCents(NaN), 0);
    assert.equal(toCents(Infinity), 0);
    assert.equal(toCents(null), 0);
    assert.equal(toCents(undefined), 0);
  });
});

describe("roundHalfAwayFromZero", () => {
  test("arredonda meio para longe do zero", () => {
    assert.equal(roundHalfAwayFromZero(0.5), 1);
    assert.equal(roundHalfAwayFromZero(-0.5), -1);
    assert.equal(roundHalfAwayFromZero(2.4), 2);
    assert.equal(roundHalfAwayFromZero(-2.6), -3);
  });
});

describe("sumCents", () => {
  test("soma exata de muitos valores", () => {
    const values = Array.from({ length: 1000 }, () => 1); // 1000 × R$ 0,01
    assert.equal(sumCents(values), 1000);
    assert.equal(sumCents([123456, -23456, 0]), 100000);
  });
  test("ignora NaN", () => {
    assert.equal(sumCents([100, NaN, 50]), 150);
  });
});

describe("splitCents", () => {
  test("divide em parcelas que somam exatamente o total", () => {
    const parts = splitCents(100000, 3); // R$ 1.000,00 em 3
    assert.deepEqual(parts, [33333, 33333, 33334]);
    assert.equal(sumCents(parts), 100000);
  });
  test("distribui o resto um centavo por parcela a partir da última", () => {
    assert.deepEqual(splitCents(1000, 3), [333, 333, 334]);
    assert.deepEqual(splitCents(1001, 3), [333, 334, 334]);
    assert.deepEqual(splitCents(1002, 3), [334, 334, 334]);
    assert.deepEqual(splitCents(10, 4), [2, 2, 3, 3]);
  });
  test("mantém o sinal em valores negativos", () => {
    assert.deepEqual(splitCents(-1000, 3), [-333, -333, -334]);
    assert.equal(sumCents(splitCents(-1000, 3)), -1000);
  });
  test("parcela única e parcelas maiores que o valor", () => {
    assert.deepEqual(splitCents(500, 1), [500]);
    assert.deepEqual(splitCents(2, 3), [0, 1, 1]);
  });
  test("rejeita número de parcelas inválido", () => {
    assert.throws(() => splitCents(100, 0));
    assert.throws(() => splitCents(100, 1.5));
  });
  test("qualquer total em 12 parcelas soma o total", () => {
    for (const total of [1, 99, 100, 1199, 123456, 999999]) {
      assert.equal(sumCents(splitCents(total, 12)), total);
    }
  });
});

describe("formatCents", () => {
  test("formata em pt-BR", () => {
    const s = formatCents(123456);
    assert.ok(s.includes("1.234,56"), s);
    assert.ok(s.startsWith("R$"), s);
  });
});

describe("percentuais", () => {
  test("percentOf", () => {
    assert.equal(percentOf(50, 200), 25);
    assert.equal(percentOf(1, 3), 33.3);
    assert.equal(percentOf(10, 0), 0);
  });
  test("percentChange", () => {
    assert.equal(percentChange(213000, 168000), 26.8);
    assert.equal(percentChange(100, 200), -50);
    assert.equal(percentChange(100, 0), null);
  });
});

describe("parseBrazilianNumber", () => {
  test("casos diversos", () => {
    assert.equal(parseBrazilianNumber("1.234.567,89"), 1234567.89);
    assert.equal(parseBrazilianNumber("1,234,567.89"), 1234567.89);
    assert.equal(parseBrazilianNumber("12.34"), 12.34);
    assert.equal(parseBrazilianNumber("12,34"), 12.34);
    assert.equal(parseBrazilianNumber("1.234"), 1234);
    assert.ok(Number.isNaN(parseBrazilianNumber("")));
  });
});
