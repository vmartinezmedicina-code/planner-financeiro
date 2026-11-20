import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dateForMonth, horizonIndex, monthIndex, pendingOccurrences, seriesEnded } from "../src/lib/finance/recurrenceDates";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (x: Date) => x.toISOString().slice(0, 10);

describe("dateForMonth", () => {
  test("dia 31 vira o último dia de meses curtos", () => {
    assert.equal(iso(dateForMonth(monthIndex(d("2026-04-01")), 31)), "2026-04-30");
    assert.equal(iso(dateForMonth(monthIndex(d("2027-02-01")), 31)), "2027-02-28");
    assert.equal(iso(dateForMonth(monthIndex(d("2028-02-01")), 30)), "2028-02-29");
  });
});

describe("horizonIndex", () => {
  test("12 meses contando o atual", () => {
    assert.equal(horizonIndex(d("2026-11-19")) - monthIndex(d("2026-11-19")), 11);
    assert.equal(iso(dateForMonth(horizonIndex(d("2026-11-19")), 1)), "2027-10-01");
  });
});

describe("pendingOccurrences", () => {
  const start = d("2026-11-19");
  const base = { startDate: start, dayOfMonth: 19, endDate: null, generatedThrough: 0, toIdx: horizonIndex(start) };

  test("série nova sem fim: 12 ocorrências, a primeira na data exata, atravessando o ano", () => {
    const dates = pendingOccurrences(base).map(iso);
    assert.equal(dates.length, 12);
    assert.equal(dates[0], "2026-11-19");
    assert.equal(dates[1], "2026-12-19");
    assert.equal(dates[2], "2027-01-19");
    assert.equal(dates[11], "2027-10-19");
  });

  test("data final corta a série (inclusiva)", () => {
    assert.deepEqual(pendingOccurrences({ ...base, endDate: d("2027-02-19") }).map(iso), ["2026-11-19", "2026-12-19", "2027-01-19", "2027-02-19"]);
    assert.equal(pendingOccurrences({ ...base, endDate: d("2027-02-18") }).length, 3);
  });

  test("renovação gera só os meses que faltam", () => {
    const next = pendingOccurrences({ ...base, generatedThrough: horizonIndex(start), toIdx: horizonIndex(d("2027-01-05")) }).map(iso);
    assert.deepEqual(next, ["2027-11-19", "2027-12-19"]);
  });

  test("nada a gerar quando já está em dia", () => {
    assert.equal(pendingOccurrences({ ...base, generatedThrough: base.toIdx }).length, 0);
  });

  test("dia 31 respeita meses curtos ao longo do ano", () => {
    const dates = pendingOccurrences({ ...base, startDate: d("2027-01-31"), dayOfMonth: 31, toIdx: monthIndex(d("2027-04-01")) }).map(iso);
    assert.deepEqual(dates, ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

describe("seriesEnded", () => {
  test("sem data final nunca termina", () => {
    assert.equal(seriesEnded(null, 10, monthIndex(d("2030-01-01"))), false);
  });
  test("termina quando a próxima ocorrência passaria da data final", () => {
    assert.equal(seriesEnded(d("2027-02-19"), 19, monthIndex(d("2027-02-01"))), true);
    assert.equal(seriesEnded(d("2027-03-19"), 19, monthIndex(d("2027-02-01"))), false);
  });
});
