import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { descriptionSimilarity, merchantKey, normalizeDescription, parseDateLoose, parseInstallment, parseInstallmentField, sourceHash, stripInstallment } from "../src/lib/imports/normalize";
import { parseAmountCents, parseStatementCsv, splitCsv } from "../src/lib/imports/csv";
import { classifyDuplicate, findRepeatedInSession } from "../src/lib/imports/dedupe";
import { planCardItem, targetRefFor } from "../src/lib/imports/plan";
import { linesFromCsv, linesFromExtraction } from "../src/lib/imports/importService";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);
const card = { closingDay: 5, dueDay: 12 };

describe("normalização", () => {
  test("parcelas em vários formatos", () => {
    assert.deepEqual(parseInstallment("MAGAZINE LUIZA PARC 03/10"), { number: 3, total: 10 });
    assert.deepEqual(parseInstallment("Loja X - Parcela 2 de 6"), { number: 2, total: 6 });
    assert.deepEqual(parseInstallment("NETSHOES 01/03"), { number: 1, total: 3 });
    assert.equal(parseInstallment("UBER TRIP"), null);
    assert.equal(parseInstallment("COMPRA 12/05/2026"), null, "data não é parcela");
    assert.equal(parseInstallment("X 11/10"), null, "n > N não é parcela");
    assert.deepEqual(parseInstallmentField("3/10"), { number: 3, total: 10 });
    assert.equal(parseInstallmentField(""), null);
  });

  test("descrição e chave da loja", () => {
    assert.equal(normalizeDescription("IFD*IFOOD CLUB"), "ifood club");
    assert.equal(normalizeDescription("PARC 03/10 Magazine Luíza"), "magazine luiza");
    assert.equal(merchantKey("MP *MERCADOLIVRE 123456"), "mercadolivre");
    assert.equal(merchantKey("Pão de Açúcar Loja 21"), "pao acucar");
  });

  test("semelhança de descrições", () => {
    assert.ok(descriptionSimilarity("IFOOD *RESTAURANTE", "iFood") >= 0.34);
    assert.ok(descriptionSimilarity("UBER TRIP", "UBER *TRIP HELP.UBER.COM") >= 0.34);
    assert.ok(descriptionSimilarity("NETFLIX", "SPOTIFY") < 0.1);
  });

  test("hash estável e sensível à parcela", () => {
    const base = { accountId: "c1", date: d("2026-10-03"), amountCents: -5000, description: "LOJA X PARC 03/10" };
    assert.equal(sourceHash({ ...base, installmentNumber: 3, installmentTotal: 10 }), sourceHash({ ...base, description: "loja  x parc 03/10", installmentNumber: 3, installmentTotal: 10 }));
    assert.notEqual(sourceHash({ ...base, installmentNumber: 3, installmentTotal: 10 }), sourceHash({ ...base, installmentNumber: 4, installmentTotal: 10 }));
  });

  test("datas soltas", () => {
    assert.equal(iso(parseDateLoose("2026-11-05")!), "2026-11-05");
    assert.equal(iso(parseDateLoose("05/11/2026")!), "2026-11-05");
    assert.equal(iso(parseDateLoose("5/11/26")!), "2026-11-05");
    assert.equal(parseDateLoose("31/02/2026"), null);
  });
});

describe("CSV", () => {
  test("valores BR e internacionais", () => {
    assert.equal(parseAmountCents("1.234,56"), 123456);
    assert.equal(parseAmountCents("-1234.56"), -123456);
    assert.equal(parseAmountCents("R$ 12,00"), 1200);
    assert.equal(parseAmountCents("(12,00)"), -1200);
    assert.equal(parseAmountCents("12,00 D"), -1200);
    assert.equal(parseAmountCents("1.234"), 123400);
    assert.equal(parseAmountCents("abc"), null);
  });

  test("aspas e separador", () => {
    assert.deepEqual(splitCsv('a;b\n"x;y";"z ""q"""\n'), [["a", "b"], ["x;y", 'z "q"']]);
  });

  test("extrato com título antes do cabeçalho e linha de saldo", () => {
    const csv = "Extrato conta 123\nData;Histórico;Valor\n01/11/2026;PIX ENVIADO Fulano;-50,00\n02/11/2026;SALDO DO DIA;1.000,00\n03/11/2026;SALARIO;5.000,00\n";
    const { rows, skipped } = parseStatementCsv(csv);
    assert.equal(rows.length, 2);
    assert.equal(skipped, 1);
    assert.equal(rows[0].amountCents, -5000);
  });

  test("fatura Nubank (compras positivas) vira negativo; pagamento sai como BILL_PAYMENT", () => {
    const { rows } = parseStatementCsv("date,title,amount\n2026-10-20,Uber Trip,23.50\n2026-10-21,Netflix,55.90\n2026-10-25,Pagamento recebido,-500.00\n");
    const lines = linesFromCsv(rows, "CARD");
    assert.equal(lines[0].amountCents, -2350);
    assert.equal(lines[0].kindHint, "PURCHASE");
    assert.equal(lines[2].amountCents, 50000);
    assert.equal(lines[2].kindHint, "BILL_PAYMENT");
  });

  test("extrato: pagamento de fatura e aplicação identificados", () => {
    const lines = linesFromCsv(
      [
        { date: d("2026-11-10"), description: "PAGTO CARTAO CREDITO", amountCents: -150000 },
        { date: d("2026-11-11"), description: "APLICACAO CDB", amountCents: -100000 },
        { date: d("2026-11-12"), description: "PIX RECEBIDO", amountCents: 2000 },
      ],
      "BANK"
    );
    assert.deepEqual(lines.map((l) => l.kindHint), ["BILL_PAYMENT", "INVESTMENT", "INCOME"]);
  });
});

describe("leitura da IA → linhas", () => {
  test("sinais por tipo e parcelas", () => {
    const { lines, invalid } = linesFromExtraction(
      {
        documentType: "CARD_STATEMENT",
        institution: "Banco",
        referenceMonth: "2026-11",
        statementTotal: 0,
        warnings: "",
        truncated: false,
        items: [
          { date: "2026-10-28", original: "IFD*IFOOD", name: "iFood", amount: 45.9, type: "PURCHASE", direction: "OUT", installment: "", categoryId: "" },
          { date: "2026-10-29", original: "ESTORNO LOJA", name: "Loja", amount: 10, type: "REFUND", direction: "IN", installment: "", categoryId: "" },
          { date: "2026-06-10", original: "LOJA X PARC 05/10", name: "Loja X", amount: 100, type: "PURCHASE", direction: "OUT", installment: "", categoryId: "" },
          { date: "", original: "SEM DATA", name: "?", amount: 1, type: "PURCHASE", direction: "OUT", installment: "", categoryId: "" },
          { date: "2026-10-30", original: "PIX", name: "Pix", amount: 5, type: "INCOME", direction: "IN", installment: "", categoryId: "" },
        ],
      },
      "CARD"
    );
    assert.equal(invalid, 1);
    assert.equal(lines[0].amountCents, -4590);
    assert.equal(lines[1].amountCents, 1000);
    assert.deepEqual(lines[2].installment, { number: 5, total: 10 });
    assert.equal(lines[3].kindHint, "REFUND", "INCOME num cartão vira estorno");
  });
});

describe("deduplicação", () => {
  const item = { date: d("2026-11-03"), amountCents: -4590, description: "IFD*IFOOD CLUB", sourceHash: "h1" };
  const cand = (over: Partial<Parameters<typeof classifyDuplicate>[1][number]>) => ({
    id: "t1",
    eventDate: d("2026-11-03"),
    amountCents: -4590,
    description: "iFood",
    sourceHash: null,
    installmentNumber: null,
    installmentTotal: null,
    ...over,
  });

  test("hash igual → LIKELY", () => {
    assert.equal(classifyDuplicate(item, [cand({ sourceHash: "h1", amountCents: 1 })]).level, "LIKELY");
  });
  test("mesmo valor, mesma data, descrição parecida → LIKELY", () => {
    assert.equal(classifyDuplicate(item, [cand({})]).level, "LIKELY");
  });
  test("mesmo valor em até 3 dias, descrição diferente → POSSIBLE", () => {
    assert.deepEqual(classifyDuplicate(item, [cand({ eventDate: d("2026-11-05"), description: "Padaria" })]), { level: "POSSIBLE", matchId: "t1" });
  });
  test("valor diferente → NEW", () => {
    assert.equal(classifyDuplicate(item, [cand({ amountCents: -4591 })]).level, "NEW");
  });
  test("parcela já lançada (data da parcela = original + n−1 meses) → LIKELY", () => {
    const parc = { date: d("2026-06-10"), amountCents: -10000, description: "LOJA X PARC 05/10", sourceHash: "h2", installmentNumber: 5, installmentTotal: 10 };
    assert.equal(classifyDuplicate(parc, [cand({ eventDate: d("2026-10-10"), amountCents: -10000, description: "Loja X (5/10)", installmentNumber: 5, installmentTotal: 10 })]).level, "LIKELY");
  });

  test("repetidos entre arquivos (prints sobrepostos), mas não no mesmo arquivo", () => {
    const base = { date: d("2026-11-03"), amountCents: -4590, description: "IFD*IFOOD", installmentNumber: null, installmentTotal: null };
    const rep = findRepeatedInSession([
      { ...base, id: "a1", fileName: "p1.jpg", position: 0 },
      { ...base, id: "a2", fileName: "p1.jpg", position: 1 },
      { ...base, id: "b1", fileName: "p2.jpg", position: 1000 },
    ]);
    assert.deepEqual([...rep.entries()], [["b1", "a1"]]);
  });
});

describe("plano de parcelas no cartão (fecha dia 5)", () => {
  test("à vista com fatura escolhida", () => {
    const plan = planCardItem(card, { year: 2026, month: 11 }, { date: d("2026-10-20"), installmentNumber: null, installmentTotal: null }, true);
    assert.equal(plan.parcels.length, 1);
    assert.deepEqual(plan.parcels[0].invoiceRef, { year: 2026, month: 11 });
  });

  test("parcela 3/5 com data original: parcelas 3, 4, 5 em nov, dez, jan", () => {
    const plan = planCardItem(card, { year: 2026, month: 11 }, { date: d("2026-08-20"), installmentNumber: 3, installmentTotal: 5 }, true);
    assert.deepEqual(plan.parcels.map((p) => [p.number, iso(p.eventDate), `${p.invoiceRef!.year}-${p.invoiceRef!.month}`]), [
      [3, "2026-10-20", "2026-11"],
      [4, "2026-11-20", "2026-12"],
      [5, "2026-12-20", "2027-1"],
    ]);
  });

  test("banco que imprime a data da parcela: recua a data original", () => {
    // Fatura nov (compras de 06/10 a 05/11); data impressa 20/10 já está nela.
    const plan = planCardItem(card, { year: 2026, month: 11 }, { date: d("2026-10-20"), installmentNumber: 3, installmentTotal: 5 }, false);
    assert.equal(iso(plan.originalDate), "2026-08-20");
    assert.equal(plan.parcels.length, 1);
    assert.equal(iso(plan.parcels[0].eventDate), "2026-10-20");
  });

  test("sem fatura escolhida: parcela n cai na fatura da compra + n−1", () => {
    // Compra 20/08 (depois do fechamento dia 5) → fatura set; parcela 3 → nov.
    assert.deepEqual(targetRefFor(card, null, { date: d("2026-08-20"), installmentNumber: 3, installmentTotal: 5 }), { year: 2026, month: 11 });
    assert.deepEqual(targetRefFor(card, null, { date: d("2026-11-03"), installmentNumber: null, installmentTotal: null }), { year: 2026, month: 11 });
  });

  test("virada de ano em parcela 12/12", () => {
    const plan = planCardItem(card, null, { date: d("2025-12-01"), installmentNumber: 12, installmentTotal: 12 }, true);
    assert.equal(plan.parcels.length, 1);
    assert.deepEqual(plan.parcels[0].invoiceRef, { year: 2026, month: 11 });
    assert.equal(iso(plan.parcels[0].eventDate), "2026-11-01");
  });
});

test("nome sem a marcação de parcela", () => {
  assert.equal(stripInstallment("Loja X Parcela 3/6"), "Loja X");
  assert.equal(stripInstallment("MAGAZINE LUIZA PARC 03/10"), "MAGAZINE LUIZA");
  assert.equal(stripInstallment("Netshoes - 01/03"), "Netshoes");
  assert.equal(stripInstallment("Uber Trip"), "Uber Trip");
  assert.equal(stripInstallment("03/10"), "03/10", "não deixa vazio");
});
