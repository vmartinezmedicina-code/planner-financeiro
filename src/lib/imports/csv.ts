import { parseDateLoose } from "./normalize";

/**
 * Leitura de CSV de extrato/fatura (puro). Reconhece as colunas pelo cabeçalho
 * (data, descrição, valor — ou entrada/saída separadas), separador ; , ou tab,
 * valores no formato brasileiro ou internacional.
 */

export type CsvRow = { date: Date; description: string; amountCents: number };

export function splitCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  // Separador mais frequente nas primeiras linhas (bancos põem título antes do cabeçalho).
  const sample = clean.split(/\r?\n/).slice(0, 10);
  let delimiter = ",";
  let bestCount = 0;
  for (const delim of ["\t", ";", ","]) {
    const count = Math.max(0, ...sample.map((l) => l.split(delim).length - 1));
    if (count > bestCount) {
      delimiter = delim;
      bestCount = count;
    }
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** "1.234,56" / "-1234.56" / "R$ 12,00" / "(12,00)" / "12,00 D" → centavos com sinal; inválido → null. */
export function parseAmountCents(raw: string): number | null {
  let v = raw.trim();
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  if (/\s[dD]$/.test(v)) {
    negative = true;
    v = v.slice(0, -2);
  } else if (/\s[cC]$/.test(v)) v = v.slice(0, -2);
  v = v.replace(/r\$|\s/gi, "");
  if (v.startsWith("-")) {
    negative = !negative;
    v = v.slice(1);
  } else if (v.startsWith("+")) v = v.slice(1);
  if (!/^[\d.,]+$/.test(v)) return null;
  const lastComma = v.lastIndexOf(",");
  const lastDot = v.lastIndexOf(".");
  let normalized: string;
  if (lastComma > lastDot) normalized = v.replace(/\./g, "").replace(",", ".");
  else if (lastDot > lastComma && v.length - lastDot - 1 !== 3) normalized = v.replace(/,/g, "");
  else if (lastDot > lastComma) normalized = v.replace(/[.,]/g, ""); // "1.234" = milhar
  else normalized = v;
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function findCol(header: string[], keys: string[]): number {
  return header.findIndex((h) => keys.some((k) => stripAccents(h).includes(k)));
}

export class CsvError extends Error {}

export function parseStatementCsv(text: string): { rows: CsvRow[]; skipped: number } {
  const all = splitCsv(text);
  // O cabeçalho pode não ser a 1ª linha (bancos colocam título/agência antes).
  const headerIdx = all.findIndex((r) => findCol(r, ["data", "date"]) !== -1 && (findCol(r, ["valor", "amount", "quantia"]) !== -1 || findCol(r, ["saida", "debito"]) !== -1));
  if (headerIdx === -1) throw new CsvError("Não encontrei as colunas de data e valor no CSV.");
  const header = all[headerIdx];
  const iDate = findCol(header, ["data", "date"]);
  const iDesc = findCol(header, ["descri", "histor", "lancamento", "estabelecimento", "title", "titulo", "memo", "detalhe"]);
  const iAmount = findCol(header, ["valor", "amount", "quantia"]);
  const iIn = findCol(header, ["entrada", "credito"]);
  const iOut = findCol(header, ["saida", "debito"]);

  const rows: CsvRow[] = [];
  let skipped = 0;
  for (const r of all.slice(headerIdx + 1)) {
    const date = parseDateLoose(r[iDate] ?? "");
    const description = (iDesc !== -1 ? r[iDesc] : "")?.trim();
    let amountCents: number | null = null;
    if (iAmount !== -1) amountCents = parseAmountCents(r[iAmount] ?? "");
    if (amountCents === null && (iIn !== -1 || iOut !== -1)) {
      const inc = iIn !== -1 ? parseAmountCents(r[iIn] ?? "") : null;
      const out = iOut !== -1 ? parseAmountCents(r[iOut] ?? "") : null;
      if (inc) amountCents = Math.abs(inc);
      else if (out) amountCents = -Math.abs(out);
    }
    if (!date || !description || amountCents === null || amountCents === 0 || /saldo/i.test(description)) {
      skipped++;
      continue;
    }
    rows.push({ date, description, amountCents });
  }
  return { rows, skipped };
}
