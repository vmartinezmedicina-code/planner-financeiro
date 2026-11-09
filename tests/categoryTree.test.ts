import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCategoryAnalysis, UNCATEGORIZED_ID, OWN_ID, type CategoryRow, type TxRow } from "../src/lib/analytics/categoryTree";

// Árvore com 4 níveis: Despesas Mensais > Alimentação > Mercado > Atacado
const categories: CategoryRow[] = [
  { id: "root", name: "Despesas Mensais", parentId: null, type: "DESPESA", order: 0 },
  { id: "ali", name: "Alimentação", parentId: "root", type: "DESPESA", order: 0 },
  { id: "mer", name: "Mercado", parentId: "ali", type: "DESPESA", order: 0 },
  { id: "ata", name: "Atacado", parentId: "mer", type: "DESPESA", order: 0 },
  { id: "res", name: "Restaurantes", parentId: "ali", type: "DESPESA", order: 1 },
  { id: "mor", name: "Moradia", parentId: "root", type: "DESPESA", order: 1 },
  { id: "lazer", name: "Lazer", parentId: "root", type: "DESPESA", order: 2 },
  { id: "rec", name: "Receitas Mensais", parentId: null, type: "RECEITA", order: 0 },
  { id: "sal", name: "Salário", parentId: "rec", type: "RECEITA", order: 0 },
];

const t = (categoryId: string | null, reais: number, month: number, year = 2026): TxRow => ({ categoryId, amountCents: Math.round(reais * 100), year, month });

const tx: TxRow[] = [
  // novembro
  t("mer", -1000, 11),
  t("ata", -630, 11),
  t("mer", -500, 11),
  t("res", -200, 11),
  t("ali", -50, 11), // direto em Alimentação
  t("mor", -2500, 11),
  t("root", -30, 11), // direto no agrupador raiz
  t(null, -70, 11), // despesa sem categoria
  t(null, 40, 11), // receita sem categoria (não entra em despesas)
  t("sal", 9000, 11),
  // outubro
  t("mer", -1680, 10),
  t("res", -400, 10),
  t("mor", -2500, 10),
  t("lazer", -300, 10),
  // setembro
  t("mer", -1500, 9),
];

const planned = new Map<string, number>([
  ["mer", 180000],
  ["res", 30000],
  ["mor", 250000],
  ["lazer", 20000],
]);

const analyze = (categoryId: string | null, type: "DESPESA" | "RECEITA" = "DESPESA") =>
  buildCategoryAnalysis({ categories, planned, tx, type, categoryId, year: 2026, month: 11 })!;

describe("nível raiz", () => {
  const a = analyze(null);

  test("mostra as grandes categorias, pulando o agrupador raiz", () => {
    const names = a.children.map((c) => c.name);
    assert.deepEqual(names, ["Moradia", "Alimentação", "Lazer", "Sem categoria", "Direto no grupo (sem subcategoria)"].sort((x, y) => a.children.find((c) => c.name === y)!.realizedCents - a.children.find((c) => c.name === x)!.realizedCents));
    assert.ok(!names.includes("Despesas Mensais"));
  });

  test("total soma todos os níveis, o que está direto no grupo e o sem categoria", () => {
    // 1000+630+500+200+50 (alimentação) + 2500 + 30 + 70
    assert.equal(a.node.realizedCents, 498000);
    assert.equal(a.node.previousCents, 488000);
    assert.equal(a.node.plannedCents, 480000);
  });

  test("ordena por realizado e calcula a participação", () => {
    assert.equal(a.children[0].name, "Moradia");
    assert.equal(a.children[1].name, "Alimentação");
    assert.equal(a.children[1].realizedCents, 238000);
    assert.equal(a.children[0].sharePct, 50.2);
  });

  test("categoria sem gasto no mês mas com orçamento ou gasto anterior continua visível", () => {
    const lazer = a.children.find((c) => c.name === "Lazer")!;
    assert.equal(lazer.realizedCents, 0);
    assert.equal(lazer.previousCents, 30000);
    assert.equal(lazer.plannedCents, 20000);
  });

  test("receita sem categoria não entra nas despesas", () => {
    assert.equal(a.children.find((c) => c.id === UNCATEGORIZED_ID)!.realizedCents, 7000);
  });

  test("linha 'direto no grupo' não abre análise", () => {
    const own = a.children.find((c) => c.id === OWN_ID)!;
    assert.equal(own.realizedCents, 3000);
    assert.equal(own.drillable, false);
  });
});

describe("drill-down recursivo", () => {
  test("nível 2: Alimentação mostra subcategorias e o que foi lançado direto nela", () => {
    const a = analyze("ali");
    assert.deepEqual(a.path.map((p) => p.name), ["Despesas", "Alimentação"]);
    assert.equal(a.node.realizedCents, 238000);
    assert.equal(a.node.ownCents, 5000);
    assert.deepEqual(a.children.map((c) => [c.name, c.realizedCents]), [["Mercado", 213000], ["Restaurantes", 20000], ["Direto em Alimentação", 5000]]);
    assert.equal(a.children[0].hasChildren, true);
    assert.equal(a.children[1].hasChildren, false);
  });

  test("nível 3: Mercado inclui o filho Atacado e compara com o mês anterior", () => {
    const a = analyze("mer");
    assert.deepEqual(a.path.map((p) => p.name), ["Despesas", "Alimentação", "Mercado"]);
    assert.equal(a.node.realizedCents, 213000); // exemplo da especificação: R$ 2.130
    assert.equal(a.node.previousCents, 168000); // R$ 1.680
    assert.equal(a.node.changePct, 26.8);
    assert.equal(a.node.plannedCents, 180000);
    assert.deepEqual(a.categoryIds.sort(), ["ata", "mer"]);
  });

  test("nível 4: folha não tem filhos", () => {
    const a = analyze("ata");
    assert.deepEqual(a.path.map((p) => p.name), ["Despesas", "Alimentação", "Mercado", "Atacado"]);
    assert.equal(a.node.realizedCents, 63000);
    assert.equal(a.children.length, 0);
    assert.equal(a.node.changePct, null, "sem gasto no mês anterior não há variação");
  });

  test("tendência traz 6 meses terminando no mês selecionado", () => {
    const a = analyze("mer");
    assert.equal(a.trend.length, 6);
    assert.deepEqual(a.trend.map((p) => p.month), [6, 7, 8, 9, 10, 11]);
    assert.deepEqual(a.trend.map((p) => p.cents), [0, 0, 0, 150000, 168000, 213000]);
  });

  test("sem categoria tem análise própria", () => {
    const a = analyze(UNCATEGORIZED_ID);
    assert.equal(a.node.realizedCents, 7000);
    assert.deepEqual(a.categoryIds, [null]);
  });

  test("categoria inexistente ou de outro tipo devolve null", () => {
    assert.equal(buildCategoryAnalysis({ categories, planned, tx, type: "DESPESA", categoryId: "sal", year: 2026, month: 11 }), null);
    assert.equal(buildCategoryAnalysis({ categories, planned, tx, type: "DESPESA", categoryId: "nao-existe", year: 2026, month: 11 }), null);
  });
});

describe("receitas e casos de borda", () => {
  test("receitas usam sinal positivo e incluem a receita sem categoria", () => {
    const a = analyze(null, "RECEITA");
    assert.equal(a.node.realizedCents, 904000);
    assert.deepEqual(a.children.map((c) => c.name), ["Salário", "Sem categoria"]);
  });

  test("estorno reduz o realizado da despesa", () => {
    const withRefund = [...tx, t("res", 80, 11)];
    const a = buildCategoryAnalysis({ categories, planned, tx: withRefund, type: "DESPESA", categoryId: "res", year: 2026, month: 11 })!;
    assert.equal(a.node.realizedCents, 12000);
  });

  test("virada de ano: janeiro compara com dezembro do ano anterior", () => {
    const janTx = [t("mer", -100, 1, 2027), t("mer", -400, 12, 2026)];
    const a = buildCategoryAnalysis({ categories, planned: new Map(), tx: janTx, type: "DESPESA", categoryId: "mer", year: 2027, month: 1 })!;
    assert.equal(a.node.previousCents, 40000);
    assert.equal(a.node.changePct, -75);
    assert.deepEqual(a.trend.map((p) => `${p.month}/${p.year}`), ["8/2026", "9/2026", "10/2026", "11/2026", "12/2026", "1/2027"]);
  });

  test("raiz sem filhos aparece como categoria normal", () => {
    const flat: CategoryRow[] = [
      { id: "a", name: "Mercado", parentId: null, type: "DESPESA", order: 0 },
      { id: "b", name: "Casa", parentId: null, type: "DESPESA", order: 1 },
    ];
    const a = buildCategoryAnalysis({ categories: flat, planned: new Map(), tx: [t("a", -10, 11), t("b", -30, 11)], type: "DESPESA", categoryId: null, year: 2026, month: 11 })!;
    assert.deepEqual(a.children.map((c) => c.name), ["Casa", "Mercado"]);
  });
});
