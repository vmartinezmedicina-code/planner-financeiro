import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";
import { TransactionStatus, TransactionSource } from "@prisma/client";
import { toCents } from "@/lib/money";
import { createTransaction, TransactionError } from "@/lib/finance/transactionService";

// Importação CSV (V1, mantida). Na Fase 6 passa a usar uma área de conferência
// (ImportSession/ImportItem) com deduplicação; por enquanto grava direto, mas
// já com kind/centavos/escopo e origem CSV, e NÃO cria mais bancos/cartões
// automaticamente: linhas com instituição desconhecida ficam sem vínculo.

function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const delimiter = lines[0]?.includes(";") ? ";" : ",";
  return lines.map((line) => line.split(delimiter).map((cell) => cell.replace(/^"|"$/g, "").trim()));
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00.000Z`);
  const brMatch = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) return new Date(`${brMatch[3]}-${brMatch[2]}-${brMatch[1]}T00:00:00.000Z`);
  return null;
}

const STATUS_MAP: Record<string, TransactionStatus> = {
  PENDENTE: TransactionStatus.PENDENTE,
  PAGO: TransactionStatus.PAGO,
  CONFIRMADO: TransactionStatus.CONFIRMADO,
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });

  const [header, ...dataRows] = rows;
  const idx = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name));

  const iEvent = idx("evento");
  const iSettlement = idx("efetiva");
  const iCategory = idx("categoria");
  const iBank = idx("instituição") !== -1 ? idx("instituição") : idx("instituicao");
  const iCard = idx("cartão") !== -1 ? idx("cartão") : idx("cartao");
  const iDesc = idx("descri");
  const iAmount = idx("valor");
  const iStatus = idx("status");
  const iRecurring = idx("recorrente");

  const [categories, existingBanks, existingCards] = await Promise.all([
    getCategoryOptions(session.householdId),
    prisma.bank.findMany({ where: { householdId: session.householdId } }),
    prisma.creditCard.findMany({ where: { householdId: session.householdId } }),
  ]);
  const categoryByLabel = new Map(categories.map((c) => [c.label.toLowerCase(), c.id]));
  const bankByName = new Map(existingBanks.map((b) => [b.name.toLowerCase(), b.id]));
  const cardByName = new Map(existingCards.map((c) => [c.name.toLowerCase(), c.id]));

  let created = 0;
  let skipped = 0;
  const unknownInstitutions = new Set<string>();

  for (const row of dataRows) {
    const eventDate = iEvent !== -1 ? parseDate(row[iEvent]) : null;
    const description = iDesc !== -1 ? row[iDesc] : "";
    if (!eventDate || !description) {
      skipped++;
      continue;
    }
    const settlementDate = iSettlement !== -1 ? parseDate(row[iSettlement]) : null;
    const categoryLabel = iCategory !== -1 ? row[iCategory]?.toLowerCase() : "";
    const categoryId = categoryLabel ? categoryByLabel.get(categoryLabel) ?? null : null;
    const amountCents = iAmount !== -1 ? toCents(row[iAmount]) : 0;
    const statusRaw = iStatus !== -1 ? row[iStatus]?.toUpperCase() : "";
    const status = STATUS_MAP[statusRaw] ?? TransactionStatus.PENDENTE;
    const isRecurring = iRecurring !== -1 ? /sim|true|1/i.test(row[iRecurring] ?? "") : false;

    const bankName = iBank !== -1 ? row[iBank] : "";
    const cardName = iCard !== -1 ? row[iCard] : "";
    const bankId = bankName ? bankByName.get(bankName.toLowerCase()) ?? null : null;
    const creditCardId = cardName ? cardByName.get(cardName.toLowerCase()) ?? null : null;
    if (bankName && !bankId) unknownInstitutions.add(bankName);
    if (cardName && !creditCardId) unknownInstitutions.add(cardName);

    if (amountCents === 0) {
      skipped++;
      continue;
    }

    try {
      await createTransaction({
        householdId: session.householdId,
        userId: session.userId,
        eventDate,
        settlementDate,
        categoryId,
        paymentMethod: creditCardId ? "CREDITO" : "DEBITO",
        bankId,
        creditCardId,
        description,
        amountCents,
        status,
        isRecurring,
        source: TransactionSource.CSV,
      });
      created++;
    } catch (e) {
      if (e instanceof TransactionError) {
        skipped++;
        continue;
      }
      throw e;
    }
  }

  return NextResponse.json({ created, skipped, unknownInstitutions: [...unknownInstitutions] });
}
