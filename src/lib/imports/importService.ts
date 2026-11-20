import { ImportStatus, ImportTarget, PaymentMethod, TransactionKind, TransactionSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fromCents } from "@/lib/money";
import { getCategoryOptions } from "@/lib/categories";
import { createTransaction } from "@/lib/finance/transactionService";
import { recalcInvoiceTotal } from "@/lib/invoices/invoiceService";
import { invoiceLabel } from "@/lib/invoices/invoicePeriod";
import { addMonthsUtc, merchantKey, parseInstallment, parseInstallmentField, parseDateLoose, sourceHash, stripInstallment } from "./normalize";
import { classifyDuplicate, findRepeatedInSession, type DedupeCandidate } from "./dedupe";
import { planCardItem, targetRefFor, type Ref } from "./plan";
import type { CsvRow } from "./csv";
import type { ExtractedDoc, ItemType } from "./extract";

export class ImportError extends Error {}

/** Tipos que entram desmarcados (não são consumo da família ou já são registrados de outro jeito). */
const EXCLUDED_BY_DEFAULT: Record<string, string> = {
  BILL_PAYMENT: "Pagamento de fatura: registre em Cartões → Pagar fatura (senão a despesa conta duas vezes).",
  OWN_TRANSFER: "Parece transferência entre contas da família; use Bancos → Transferir.",
  INVESTMENT: "Aplicação/resgate de investimento: não é receita nem despesa.",
};

export type RawLine = {
  date: Date;
  original: string;
  name: string;
  amountCents: number; // com sinal
  kindHint: ItemType;
  installment: { number: number; total: number } | null;
  aiCategoryId: string | null;
};

// ---------------------------------------------------------------------------
// Conversão das fontes em linhas brutas
// ---------------------------------------------------------------------------

export function linesFromExtraction(doc: ExtractedDoc, target: "CARD" | "BANK"): { lines: RawLine[]; invalid: number } {
  const lines: RawLine[] = [];
  let invalid = 0;
  for (const it of doc.items) {
    const date = parseDateLoose(it.date ?? "");
    const cents = Math.round(Math.abs(Number(it.amount)) * 100);
    if (!date || !cents || !it.original?.trim()) {
      invalid++;
      continue;
    }
    let kind = it.type;
    if (target === "CARD" && !["PURCHASE", "REFUND", "FEE", "BILL_PAYMENT"].includes(kind)) kind = it.direction === "IN" ? "REFUND" : "PURCHASE";
    if (target === "BANK" && ["PURCHASE", "REFUND", "FEE"].includes(kind)) kind = it.direction === "IN" ? "INCOME" : "EXPENSE";
    let sign: 1 | -1;
    if (target === "CARD") sign = kind === "PURCHASE" || kind === "FEE" ? -1 : 1;
    else if (kind === "INCOME") sign = 1;
    else if (kind === "EXPENSE" || kind === "BILL_PAYMENT") sign = -1;
    else sign = it.direction === "IN" ? 1 : -1;
    lines.push({
      date,
      original: it.original.trim(),
      name: stripInstallment(it.name || it.original),
      amountCents: sign * cents,
      kindHint: kind,
      installment: parseInstallmentField(it.installment) ?? parseInstallment(it.original),
      aiCategoryId: it.categoryId || null,
    });
  }
  return { lines, invalid };
}

export function linesFromCsv(rows: CsvRow[], target: "CARD" | "BANK"): RawLine[] {
  // Faturas em CSV (ex.: Nubank) trazem compras positivas; extratos trazem saídas negativas.
  const positives = rows.filter((r) => r.amountCents > 0).length;
  const flip = target === "CARD" && positives > rows.length / 2;
  return rows.map((r) => {
    const amountCents = flip ? -r.amountCents : r.amountCents;
    const d = r.description;
    let kindHint: ItemType;
    if (target === "CARD") {
      kindHint = amountCents < 0 ? (/\b(iof|anuidade|juros|multa|encargo|tarifa)\b/i.test(d) ? "FEE" : "PURCHASE") : /pagamento/i.test(d) ? "BILL_PAYMENT" : "REFUND";
    } else if (/fatura|pag(?:to|amento)?\.?\s*cart[aã]o|cart[aã]o\s*cr[eé]dito/i.test(d) && amountCents < 0) kindHint = "BILL_PAYMENT";
    else if (/aplica[cç][aã]o|resgate|poupan[cç]a|\bcdb\b|tesouro/i.test(d)) kindHint = "INVESTMENT";
    else kindHint = amountCents > 0 ? "INCOME" : "EXPENSE";
    return { date: r.date, original: d, name: stripInstallment(d), amountCents, kindHint, installment: parseInstallment(d), aiCategoryId: null };
  });
}

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

export type CreateImportInput = {
  householdId: string;
  userId: string;
  target: "CARD" | "BANK";
  creditCardId?: string | null;
  bankId?: string | null;
  memberId?: string | null;
  invoiceRef?: Ref | null;
  createFutureParcels?: boolean;
};

export async function createImportSession(input: CreateImportInput) {
  if (input.target === "CARD") {
    const card = input.creditCardId
      ? await prisma.creditCard.findFirst({ where: { id: input.creditCardId, householdId: input.householdId }, select: { id: true } })
      : null;
    if (!card) throw new ImportError("Escolha o cartão da fatura.");
  } else {
    const bank = input.bankId ? await prisma.bank.findFirst({ where: { id: input.bankId, householdId: input.householdId }, select: { id: true } }) : null;
    if (!bank) throw new ImportError("Escolha a conta do extrato.");
  }
  if (input.memberId) {
    const m = await prisma.householdMember.findFirst({ where: { id: input.memberId, householdId: input.householdId }, select: { id: true } });
    if (!m) throw new ImportError("Membro não encontrado.");
  }
  return prisma.importSession.create({
    data: {
      householdId: input.householdId,
      userId: input.userId,
      target: input.target as ImportTarget,
      creditCardId: input.target === "CARD" ? input.creditCardId : null,
      bankId: input.target === "BANK" ? input.bankId : null,
      memberId: input.memberId ?? null,
      invoiceYear: input.target === "CARD" ? (input.invoiceRef?.year ?? null) : null,
      invoiceMonth: input.target === "CARD" ? (input.invoiceRef?.month ?? null) : null,
      createFutureParcels: input.createFutureParcels ?? true,
    },
  });
}

async function loadSession(id: string, householdId: string) {
  const s = await prisma.importSession.findFirst({ where: { id, householdId } });
  if (!s) throw new ImportError("Importação não encontrada.");
  return s;
}

function accountIdOf(s: { creditCardId: string | null; bankId: string | null }): string {
  return (s.creditCardId ?? s.bankId)!;
}

/** Categoria mais usada no histórico para cada loja (chave normalizada). */
async function categoryHistory(householdId: string): Promise<Map<string, string>> {
  const since = new Date(Date.now() - 540 * 86400000);
  const rows = await prisma.transaction.findMany({
    where: { householdId, categoryId: { not: null }, eventDate: { gte: since }, kind: { in: [TransactionKind.EXPENSE, TransactionKind.CARD_PURCHASE, TransactionKind.INCOME] } },
    select: { description: true, categoryId: true },
    orderBy: { eventDate: "desc" },
    take: 5000,
  });
  const counts = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const key = merchantKey(r.description.replace(/\(\d+\/\d+\)\s*$/, ""));
    if (!key) continue;
    const m = counts.get(key) ?? new Map<string, number>();
    m.set(r.categoryId!, (m.get(r.categoryId!) ?? 0) + 1);
    counts.set(key, m);
  }
  const best = new Map<string, string>();
  for (const [key, m] of counts) best.set(key, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return best;
}

/**
 * Acrescenta à conferência as linhas de um arquivo: hash, categoria sugerida
 * (histórico → IA), deduplicação contra o que já está lançado e marcação dos
 * tipos que não devem entrar por padrão.
 */
export async function addLines(
  sessionId: string,
  householdId: string,
  file: { name: string; index: number },
  lines: RawLine[],
  meta: { institution?: string | null; statementTotalCents?: number | null; warnings?: string[] } = {}
): Promise<number> {
  const session = await loadSession(sessionId, householdId);
  if (session.status !== ImportStatus.REVIEW) throw new ImportError("Esta importação já foi confirmada.");
  const accountId = accountIdOf(session);

  if (lines.length > 0) {
    const [history, categories] = await Promise.all([categoryHistory(householdId), getCategoryOptions(householdId)]);
    const catType = new Map(categories.map((c) => [c.id, c.type]));

    // Candidatos a duplicidade: mesma conta/cartão, num intervalo que cobre as datas
    // impressas e as datas das parcelas (original + n−1 meses).
    const times = lines.flatMap((l) => [l.date.getTime(), l.installment ? addMonthsUtc(l.date, l.installment.number - 1).getTime() : l.date.getTime()]);
    const from = new Date(Math.min(...times) - 4 * 86400000);
    const to = new Date(Math.max(...times) + 46 * 86400000);
    const existing = await prisma.transaction.findMany({
      where: {
        householdId,
        ...(session.target === "CARD" ? { creditCardId: accountId, kind: TransactionKind.CARD_PURCHASE } : { bankId: accountId }),
        eventDate: { gte: from, lte: to },
      },
      select: { id: true, eventDate: true, amountCents: true, description: true, sourceHash: true, installmentNumber: true, installmentPurchase: { select: { installmentsCount: true } } },
    });
    const candidates: DedupeCandidate[] = existing.map((t) => ({
      id: t.id,
      eventDate: t.eventDate,
      amountCents: t.amountCents,
      description: t.description,
      sourceHash: t.sourceHash,
      installmentNumber: t.installmentNumber,
      installmentTotal: t.installmentPurchase?.installmentsCount ?? null,
    }));

    const data = lines.map((l, i) => {
      const hash = sourceHash({
        accountId,
        date: l.date,
        amountCents: l.amountCents,
        description: l.original,
        installmentNumber: l.installment?.number,
        installmentTotal: l.installment?.total,
      });
      const dup = classifyDuplicate(
        { date: l.date, amountCents: l.amountCents, description: l.original, sourceHash: hash, installmentNumber: l.installment?.number, installmentTotal: l.installment?.total },
        candidates
      );
      const wantType = l.amountCents > 0 && session.target === "BANK" ? "RECEITA" : "DESPESA";
      const histCat = history.get(merchantKey(l.name)) ?? history.get(merchantKey(l.original));
      let categoryId: string | null = null;
      let categorySource: string | null = null;
      if (histCat && catType.get(histCat) === wantType) {
        categoryId = histCat;
        categorySource = "HISTORY";
      } else if (l.aiCategoryId && catType.get(l.aiCategoryId) === wantType) {
        categoryId = l.aiCategoryId;
        categorySource = "AI";
      }
      const excludedNote = EXCLUDED_BY_DEFAULT[l.kindHint];
      const notes: string[] = [];
      if (excludedNote) notes.push(excludedNote);
      if (dup.level === "LIKELY") notes.push("Já está lançado.");
      else if (dup.level === "POSSIBLE") notes.push("Há um lançamento de mesmo valor em data próxima. Confira.");
      return {
        sessionId,
        position: file.index * 1000 + i,
        fileName: file.name,
        date: l.date,
        originalDescription: l.original,
        description: l.name.slice(0, 120),
        amountCents: l.amountCents,
        kindHint: l.kindHint,
        categoryId,
        categorySource,
        installmentNumber: l.installment?.number ?? null,
        installmentTotal: l.installment?.total ?? null,
        include: !excludedNote && dup.level !== "LIKELY",
        duplicateStatus: dup.level,
        duplicateOfId: dup.matchId,
        note: notes.join(" ") || null,
        sourceHash: hash,
      };
    });
    await prisma.importItem.createMany({ data });
  }

  const warnings = [session.warnings, ...(meta.warnings ?? []).filter(Boolean).map((w) => `${file.name}: ${w}`)].filter(Boolean).join("\n");
  await prisma.importSession.update({
    where: { id: sessionId },
    data: {
      fileCount: { increment: 1 },
      warnings: warnings || null,
      ...(meta.institution && !session.detectedInstitution ? { detectedInstitution: meta.institution } : {}),
      ...(meta.statementTotalCents && !session.statementTotalCents ? { statementTotalCents: meta.statementTotalCents } : {}),
    },
  });
  return lines.length;
}

/** Marca itens repetidos entre arquivos (prints que se sobrepõem). Rodar depois de enviar todos os arquivos. */
export async function markRepeated(sessionId: string, householdId: string): Promise<number> {
  await loadSession(sessionId, householdId);
  const items = await prisma.importItem.findMany({
    where: { sessionId },
    select: { id: true, fileName: true, position: true, date: true, amountCents: true, description: true, originalDescription: true, installmentNumber: true, installmentTotal: true, duplicateStatus: true },
  });
  const repeated = findRepeatedInSession(items.map((i) => ({ ...i, description: i.originalDescription })));
  let changed = 0;
  for (const it of items) {
    const of = repeated.get(it.id);
    if (!of || it.duplicateStatus === "REPEATED" || it.duplicateStatus === "LIKELY") continue;
    await prisma.importItem.update({
      where: { id: it.id },
      data: { duplicateStatus: "REPEATED", duplicateOfId: of, include: false, note: "Repetido em outro arquivo desta importação." },
    });
    changed++;
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Conferência
// ---------------------------------------------------------------------------

export type ImportItemView = {
  id: string;
  fileName: string | null;
  date: string;
  originalDescription: string;
  description: string;
  amountCents: number;
  kindHint: string;
  categoryId: string | null;
  categorySource: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  include: boolean;
  locked: boolean; // pagamento de fatura no cartão não pode entrar
  duplicateStatus: string;
  note: string | null;
  invoiceLabel: string | null;
  futureParcels: number;
  transactionId: string | null;
};

export type ImportView = {
  id: string;
  target: "CARD" | "BANK";
  status: "REVIEW" | "COMPLETED";
  accountName: string;
  creditCardId: string | null;
  bankId: string | null;
  memberId: string | null;
  invoiceRef: Ref | null;
  invoiceLabel: string | null;
  createFutureParcels: boolean;
  detectedInstitution: string | null;
  statementTotalCents: number | null;
  warnings: string[];
  fileCount: number;
  createdAt: string;
  completedAt: string | null;
  items: ImportItemView[];
  totals: { included: number; outCents: number; inCents: number; netCents: number; futureParcels: number; duplicates: number };
};

export async function getImportView(id: string, householdId: string): Promise<ImportView> {
  const s = await loadSession(id, householdId);
  const [items, card, bank] = await Promise.all([
    prisma.importItem.findMany({ where: { sessionId: id }, orderBy: [{ date: "asc" }, { position: "asc" }] }),
    s.creditCardId ? prisma.creditCard.findFirst({ where: { id: s.creditCardId, householdId }, select: { name: true, closingDay: true, dueDay: true } }) : null,
    s.bankId ? prisma.bank.findFirst({ where: { id: s.bankId, householdId }, select: { name: true } }) : null,
  ]);
  const fixedRef = s.invoiceYear && s.invoiceMonth ? { year: s.invoiceYear, month: s.invoiceMonth } : null;

  const views: ImportItemView[] = items.map((it) => {
    let label: string | null = null;
    let future = 0;
    if (card) {
      const ref = targetRefFor(card, fixedRef, it);
      label = invoiceLabel(ref.year, ref.month);
      if (it.installmentNumber && it.installmentTotal && s.createFutureParcels) future = it.installmentTotal - it.installmentNumber;
    }
    return {
      id: it.id,
      fileName: it.fileName,
      date: it.date.toISOString(),
      originalDescription: it.originalDescription,
      description: it.description,
      amountCents: it.amountCents,
      kindHint: it.kindHint,
      categoryId: it.categoryId,
      categorySource: it.categorySource,
      installmentNumber: it.installmentNumber,
      installmentTotal: it.installmentTotal,
      include: it.include,
      locked: s.target === "CARD" && it.kindHint === "BILL_PAYMENT",
      duplicateStatus: it.duplicateStatus,
      note: it.note,
      invoiceLabel: label,
      futureParcels: future,
      transactionId: it.transactionId,
    };
  });

  const inc = views.filter((v) => v.include && !v.locked);
  const outCents = inc.filter((v) => v.amountCents < 0).reduce((a, v) => a - v.amountCents, 0);
  const inCents = inc.filter((v) => v.amountCents > 0).reduce((a, v) => a + v.amountCents, 0);

  return {
    id: s.id,
    target: s.target as "CARD" | "BANK",
    status: s.status as "REVIEW" | "COMPLETED",
    accountName: card?.name ?? bank?.name ?? "(conta removida)",
    creditCardId: s.creditCardId,
    bankId: s.bankId,
    memberId: s.memberId,
    invoiceRef: fixedRef,
    invoiceLabel: fixedRef ? invoiceLabel(fixedRef.year, fixedRef.month) : null,
    createFutureParcels: s.createFutureParcels,
    detectedInstitution: s.detectedInstitution,
    statementTotalCents: s.statementTotalCents,
    warnings: s.warnings ? s.warnings.split("\n") : [],
    fileCount: s.fileCount,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    items: views,
    totals: {
      included: inc.length,
      outCents,
      inCents,
      netCents: inCents - outCents,
      futureParcels: inc.reduce((a, v) => a + v.futureParcels, 0),
      duplicates: views.filter((v) => v.duplicateStatus !== "NEW").length,
    },
  };
}

export type ItemPatch = {
  id: string;
  include?: boolean;
  description?: string;
  categoryId?: string | null;
  date?: Date;
  amountCents?: number;
};

export async function updateImport(
  id: string,
  householdId: string,
  patch: { items?: ItemPatch[]; memberId?: string | null; invoiceRef?: Ref | null; createFutureParcels?: boolean }
) {
  const s = await loadSession(id, householdId);
  if (s.status !== ImportStatus.REVIEW) throw new ImportError("Esta importação já foi confirmada. Desfaça para editar.");

  if (patch.items?.length) {
    const ids = patch.items.map((p) => p.id);
    const owned = await prisma.importItem.findMany({ where: { sessionId: id, id: { in: ids } }, select: { id: true, kindHint: true } });
    const ownedMap = new Map(owned.map((o) => [o.id, o]));
    const categoryIds = [...new Set(patch.items.map((p) => p.categoryId).filter((c): c is string => !!c))];
    if (categoryIds.length) {
      const n = await prisma.category.count({ where: { id: { in: categoryIds }, householdId } });
      if (n !== categoryIds.length) throw new ImportError("Categoria inválida.");
    }
    for (const p of patch.items) {
      const item = ownedMap.get(p.id);
      if (!item) continue;
      await prisma.importItem.update({
        where: { id: p.id },
        data: {
          ...(p.include !== undefined ? { include: s.target === "CARD" && item.kindHint === "BILL_PAYMENT" ? false : p.include } : {}),
          ...(p.description !== undefined ? { description: p.description.trim().slice(0, 120) || "Sem descrição" } : {}),
          ...(p.categoryId !== undefined ? { categoryId: p.categoryId, categorySource: "USER" } : {}),
          ...(p.date !== undefined ? { date: p.date } : {}),
          ...(p.amountCents !== undefined ? { amountCents: Math.round(p.amountCents) } : {}),
        },
      });
    }
  }

  const data: Record<string, unknown> = {};
  if (patch.memberId !== undefined) {
    if (patch.memberId) {
      const m = await prisma.householdMember.findFirst({ where: { id: patch.memberId, householdId }, select: { id: true } });
      if (!m) throw new ImportError("Membro não encontrado.");
    }
    data.memberId = patch.memberId;
  }
  if (patch.invoiceRef !== undefined && s.target === "CARD") {
    data.invoiceYear = patch.invoiceRef?.year ?? null;
    data.invoiceMonth = patch.invoiceRef?.month ?? null;
  }
  if (patch.createFutureParcels !== undefined) data.createFutureParcels = patch.createFutureParcels;
  if (Object.keys(data).length) await prisma.importSession.update({ where: { id }, data });
}

function sourceForFile(fileName: string | null): TransactionSource {
  const ext = (fileName ?? "").toLowerCase().split(".").pop();
  if (ext === "pdf") return TransactionSource.PDF;
  if (ext === "csv" || ext === "txt") return TransactionSource.CSV;
  if (ext && ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(ext)) return TransactionSource.IMAGE;
  return TransactionSource.IMPORT;
}

/**
 * Grava os itens marcados como lançamentos, em lotes (retomável: itens já
 * gravados têm transactionId). Compras parceladas criam a compra parcelada e
 * as parcelas n…N, cada uma na sua fatura.
 */
export async function commitImport(id: string, householdId: string, userId: string, limit = 40): Promise<{ created: number; remaining: number }> {
  const s = await loadSession(id, householdId);
  if (s.status !== ImportStatus.REVIEW) throw new ImportError("Esta importação já foi confirmada.");
  const accountId = accountIdOf(s);
  const card = s.creditCardId
    ? await prisma.creditCard.findFirst({ where: { id: s.creditCardId, householdId }, select: { id: true, closingDay: true, dueDay: true } })
    : null;
  if (s.target === "CARD" && !card) throw new ImportError("O cartão desta importação não existe mais.");
  if (s.target === "BANK" && !(await prisma.bank.findFirst({ where: { id: accountId, householdId }, select: { id: true } }))) {
    throw new ImportError("A conta desta importação não existe mais.");
  }
  const fixedRef = s.invoiceYear && s.invoiceMonth ? { year: s.invoiceYear, month: s.invoiceMonth } : null;

  const pending = await prisma.importItem.findMany({
    where: { sessionId: id, include: true, transactionId: null, NOT: s.target === "CARD" ? { kindHint: "BILL_PAYMENT" } : undefined },
    orderBy: { position: "asc" },
    take: limit,
  });

  const touchedInvoices = new Set<string>();
  let created = 0;
  for (const it of pending) {
    const base = {
      householdId,
      userId,
      categoryId: it.categoryId,
      memberId: s.memberId,
      source: sourceForFile(it.fileName),
      importSessionId: id,
    };
    let firstId: string;
    if (card) {
      const plan = planCardItem(card, fixedRef, it, s.createFutureParcels);
      if (it.installmentNumber && it.installmentTotal) {
        const parcelCents = Math.abs(it.amountCents);
        const purchase = await prisma.installmentPurchase.create({
          data: {
            description: it.description,
            totalAmount: fromCents(parcelCents * it.installmentTotal),
            totalAmountCents: parcelCents * it.installmentTotal,
            installmentsCount: it.installmentTotal,
            purchaseDate: plan.originalDate,
            categoryId: it.categoryId,
            creditCardId: card.id,
            userId,
            householdId,
          },
        });
        let first: string | null = null;
        for (const p of plan.parcels) {
          const tx = await createTransaction({
            ...base,
            eventDate: p.eventDate,
            description: `${it.description} (${p.number}/${it.installmentTotal})`,
            amountCents: -parcelCents,
            kind: "CARD_PURCHASE",
            paymentMethod: PaymentMethod.CREDITO,
            creditCardId: card.id,
            installmentPurchaseId: purchase.id,
            installmentNumber: p.number,
            invoiceRef: p.invoiceRef,
            skipInvoiceRecalc: true,
            sourceHash:
              p.number === it.installmentNumber
                ? it.sourceHash
                : sourceHash({ accountId, date: it.date, amountCents: it.amountCents, description: it.originalDescription, installmentNumber: p.number, installmentTotal: it.installmentTotal }),
          });
          if (tx.invoiceId) touchedInvoices.add(tx.invoiceId);
          first ??= tx.id;
        }
        firstId = first!;
      } else {
        const tx = await createTransaction({
          ...base,
          eventDate: it.date,
          description: it.description,
          amountCents: it.amountCents,
          kind: "CARD_PURCHASE",
          allowCredit: true,
          paymentMethod: PaymentMethod.CREDITO,
          creditCardId: card.id,
          invoiceRef: plan.parcels[0].invoiceRef,
          skipInvoiceRecalc: true,
          sourceHash: it.sourceHash,
        });
        if (tx.invoiceId) touchedInvoices.add(tx.invoiceId);
        firstId = tx.id;
      }
    } else {
      const tx = await createTransaction({
        ...base,
        eventDate: it.date,
        description: it.description,
        amountCents: it.amountCents,
        paymentMethod: /\bpix\b/i.test(it.originalDescription) ? PaymentMethod.PIX : PaymentMethod.DEBITO,
        bankId: accountId,
        sourceHash: it.sourceHash,
      });
      firstId = tx.id;
    }
    await prisma.importItem.update({ where: { id: it.id }, data: { transactionId: firstId } });
    created++;
  }

  for (const invoiceId of touchedInvoices) await recalcInvoiceTotal(prisma, invoiceId);

  const remaining = await prisma.importItem.count({
    where: { sessionId: id, include: true, transactionId: null, NOT: s.target === "CARD" ? { kindHint: "BILL_PAYMENT" } : undefined },
  });
  if (remaining === 0) await prisma.importSession.update({ where: { id }, data: { status: ImportStatus.COMPLETED, completedAt: new Date() } });
  return { created, remaining };
}

/**
 * Desfaz uma importação: remove tudo o que ela lançou (inclusive parcelas
 * futuras e compras parceladas criadas), recalcula as faturas e volta para a
 * conferência. Importações só criam compras no cartão, receitas e despesas.
 */
export async function undoImport(id: string, householdId: string): Promise<{ deleted: number }> {
  await loadSession(id, householdId);
  const txs = await prisma.transaction.findMany({ where: { importSessionId: id, householdId }, select: { invoiceId: true, installmentPurchaseId: true, kind: true } });
  const invoices = new Set(txs.map((t) => t.invoiceId).filter((x): x is string => !!x));
  const purchases = new Set(txs.map((t) => t.installmentPurchaseId).filter((x): x is string => !!x));
  if (txs.some((t) => !([TransactionKind.CARD_PURCHASE, TransactionKind.INCOME, TransactionKind.EXPENSE] as TransactionKind[]).includes(t.kind))) {
    throw new ImportError("Há lançamentos desta importação que mudaram de tipo; exclua-os em Lançamentos.");
  }
  const res = await prisma.transaction.deleteMany({ where: { importSessionId: id, householdId } });
  for (const pid of purchases) {
    const left = await prisma.transaction.count({ where: { installmentPurchaseId: pid } });
    if (left === 0) await prisma.installmentPurchase.delete({ where: { id: pid } }).catch(() => undefined);
  }
  for (const inv of invoices) await recalcInvoiceTotal(prisma, inv);
  await prisma.importItem.updateMany({ where: { sessionId: id }, data: { transactionId: null } });
  await prisma.importSession.update({ where: { id }, data: { status: ImportStatus.REVIEW, completedAt: null } });
  return { deleted: res.count };
}

/** Descarta uma importação em conferência (nada foi lançado). */
export async function discardImport(id: string, householdId: string) {
  const s = await loadSession(id, householdId);
  const linked = await prisma.transaction.count({ where: { importSessionId: id } });
  if (s.status === ImportStatus.COMPLETED || linked > 0) throw new ImportError("Desfaça a importação antes de excluí-la.");
  await prisma.importSession.delete({ where: { id } });
}

export async function listImports(householdId: string) {
  const sessions = await prisma.importSession.findMany({
    where: { householdId },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { _count: { select: { items: true } } },
  });
  const cardIds = sessions.map((s) => s.creditCardId).filter((x): x is string => !!x);
  const bankIds = sessions.map((s) => s.bankId).filter((x): x is string => !!x);
  const [cards, banks] = await Promise.all([
    prisma.creditCard.findMany({ where: { id: { in: cardIds }, householdId }, select: { id: true, name: true } }),
    prisma.bank.findMany({ where: { id: { in: bankIds }, householdId }, select: { id: true, name: true } }),
  ]);
  const names = new Map([...cards, ...banks].map((x) => [x.id, x.name]));
  return sessions.map((s) => ({
    id: s.id,
    target: s.target,
    status: s.status,
    accountName: names.get(accountIdOf(s)) ?? "(conta removida)",
    invoiceLabel: s.invoiceYear && s.invoiceMonth ? invoiceLabel(s.invoiceYear, s.invoiceMonth) : null,
    itemCount: s._count.items,
    fileCount: s.fileCount,
    createdAt: s.createdAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
  }));
}
