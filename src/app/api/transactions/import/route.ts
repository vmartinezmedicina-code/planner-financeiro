import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCategoryOptions } from "@/lib/categories";
import { TransactionStatus } from "@prisma/client";
import { resolvePaymentLinks } from "@/lib/paymentMethod";

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

function parseAmount(value: string): number {
  return Number(value.replace(/\./g, "").replace(",", ".")) || 0;
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

  const categories = await getCategoryOptions();
  const categoryByLabel = new Map(categories.map((c) => [c.label.toLowerCase(), c.id]));

  const [existingBanks, existingCards] = await Promise.all([
    prisma.bank.findMany(),
    prisma.creditCard.findMany(),
  ]);
  const bankByName = new Map(existingBanks.map((b) => [b.name.toLowerCase(), b.id]));
  const cardByName = new Map(existingCards.map((c) => [c.name.toLowerCase(), c.id]));

  async function resolveBankId(name: string | undefined): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (bankByName.has(key)) return bankByName.get(key)!;
    const bank = await prisma.bank.create({ data: { name, initialBalance: 0 } });
    bankByName.set(key, bank.id);
    return bank.id;
  }

  async function resolveCardId(name: string | undefined): Promise<string | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (cardByName.has(key)) return cardByName.get(key)!;
    const card = await prisma.creditCard.create({ data: { name } });
    cardByName.set(key, card.id);
    return card.id;
  }

  let created = 0;
  let skipped = 0;

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
    const amount = iAmount !== -1 ? parseAmount(row[iAmount]) : 0;
    const statusRaw = iStatus !== -1 ? row[iStatus]?.toUpperCase() : "";
    const status = STATUS_MAP[statusRaw] ?? TransactionStatus.PENDENTE;
    const isRecurring = iRecurring !== -1 ? /sim|true|1/i.test(row[iRecurring] ?? "") : false;

    const rawBankId = await resolveBankId(iBank !== -1 ? row[iBank] : undefined);
    const rawCreditCardId = await resolveCardId(iCard !== -1 ? row[iCard] : undefined);
    // Se a linha traz um cartão, a forma de pagamento é crédito (fatura);
    // caso contrário, cai em débito e usa o banco (nunca os dois juntos).
    const paymentMethod = rawCreditCardId ? "CREDITO" : "DEBITO";
    const { bankId, creditCardId } = resolvePaymentLinks(paymentMethod, rawBankId, rawCreditCardId);

    await prisma.transaction.create({
      data: {
        eventDate,
        settlementDate,
        categoryId,
        paymentMethod,
        bankId,
        creditCardId,
        description,
        amount,
        status,
        isRecurring,
        userId: session.userId,
      },
    });
    created++;
  }

  return NextResponse.json({ created, skipped });
}
