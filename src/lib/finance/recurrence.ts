import { TransactionKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { todayAsUtcDate } from "@/lib/format";
import { CONSUMPTION_KINDS, deriveKind, normalizeSign, type TransactionKindValue } from "./kinds";
import { fromCents } from "@/lib/money";
import { recalcInvoiceTotal } from "@/lib/invoices/invoiceService";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  TransactionError,
  type CreateTransactionInput,
  type UpdateTransactionInput,
} from "./transactionService";
import { dateForMonth, horizonIndex, monthIndex, pendingOccurrences, seriesEnded } from "./recurrenceDates";

/**
 * Lançamentos recorrentes mensais.
 *
 * Uma série (RecurringSeries) guarda o modelo; as ocorrências são lançamentos
 * normais ligados a ela, criados até 12 meses à frente e completados
 * automaticamente conforme o tempo passa (ensureRecurringHorizon). Cada
 * ocorrência no cartão cai na fatura do mês dela, como qualquer compra.
 */

type SeriesRow = NonNullable<Awaited<ReturnType<typeof prisma.recurringSeries.findUnique>>>;

/** Criar/completar uma série faz várias escritas; com o banco na rede, 5 s (padrão) é pouco. */
const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 };

function templateFrom(series: SeriesRow): Omit<CreateTransactionInput, "eventDate"> {
  return {
    householdId: series.householdId,
    userId: series.userId,
    description: series.description,
    amountCents: series.amountCents,
    kind: series.kind as TransactionKindValue,
    paymentMethod: series.paymentMethod,
    bankId: series.bankId,
    creditCardId: series.creditCardId,
    categoryId: series.categoryId,
    memberId: series.memberId,
    isRecurring: true,
    recurringSeriesId: series.id,
  };
}

/** Cria a série e as ocorrências até o horizonte. Devolve a primeira ocorrência. */
export async function createRecurringSeries(input: CreateTransactionInput & { endDate?: Date | null }, today: Date = todayAsUtcDate()) {
  const kind = input.kind ?? deriveKind(input.paymentMethod ?? "DEBITO", input.amountCents);
  if (!CONSUMPTION_KINDS.includes(kind)) throw new TransactionError("Só receitas, despesas e compras no cartão podem ser recorrentes.");
  if (input.installmentPurchaseId) throw new TransactionError("Compra parcelada não pode ser recorrente.");
  const endDate = input.endDate ?? null;
  if (endDate && endDate.getTime() < input.eventDate.getTime()) throw new TransactionError("A data final precisa ser depois da primeira ocorrência.");

  return prisma.$transaction(async (tx) => {
    const series = await tx.recurringSeries.create({
      data: {
        householdId: input.householdId,
        userId: input.userId,
        description: input.description,
        amountCents: normalizeSign(kind, Math.round(input.amountCents)),
        kind: kind as TransactionKind,
        paymentMethod: input.paymentMethod ?? (kind === "CARD_PURCHASE" ? "CREDITO" : "DEBITO"),
        bankId: input.bankId ?? null,
        creditCardId: input.creditCardId ?? null,
        categoryId: input.categoryId ?? null,
        memberId: input.memberId ?? null,
        dayOfMonth: input.eventDate.getUTCDate(),
        startDate: input.eventDate,
        endDate,
      },
    });

    const toIdx = Math.max(horizonIndex(today), monthIndex(input.eventDate));
    const dates = pendingOccurrences({ startDate: input.eventDate, dayOfMonth: series.dayOfMonth, endDate, generatedThrough: 0, toIdx });

    let first = null;
    for (const [i, date] of dates.entries()) {
      const created = await createTransaction(
        {
          ...input,
          kind,
          eventDate: date,
          // efetivação diferente só vale para a primeira; as próximas seguem a data do mês
          settlementDate: i === 0 ? input.settlementDate : null,
          isRecurring: true,
          recurringSeriesId: series.id,
        },
        tx
      );
      if (i === 0) first = created;
    }

    // Grava o modelo já normalizado pela primeira ocorrência (sinal, vínculos coerentes).
    if (first) {
      await tx.recurringSeries.update({
        where: { id: series.id },
        data: {
          generatedThrough: toIdx,
          active: !seriesEnded(endDate, series.dayOfMonth, toIdx),
          amountCents: first.amountCents,
          kind: first.kind,
          paymentMethod: first.paymentMethod,
          bankId: first.bankId,
          creditCardId: first.creditCardId,
        },
      });
    }
    return { first: first!, count: dates.length, seriesId: series.id };
  }, TX_OPTIONS);
}

/**
 * Gera as ocorrências que faltam de uma série até `toIdx`. Usa uma trava
 * otimista em `generatedThrough` para duas requisições simultâneas não
 * duplicarem meses. Devolve quantas ocorrências criou.
 */
async function generateForSeries(seriesId: string, toIdx: number): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const series = await tx.recurringSeries.findUnique({ where: { id: seriesId } });
    if (!series || !series.active || series.generatedThrough >= toIdx) return 0;

    // Cartão ou conta removidos: a série não tem para onde gerar; encerra.
    if ((series.kind === "CARD_PURCHASE" && !series.creditCardId) || (series.kind !== "CARD_PURCHASE" && !series.bankId)) {
      await tx.recurringSeries.update({ where: { id: series.id }, data: { active: false } });
      return 0;
    }

    const claimed = await tx.recurringSeries.updateMany({
      where: { id: series.id, generatedThrough: series.generatedThrough },
      data: { generatedThrough: toIdx, active: !seriesEnded(series.endDate, series.dayOfMonth, toIdx) },
    });
    if (claimed.count === 0) return 0;

    const dates = pendingOccurrences({
      startDate: series.startDate,
      dayOfMonth: series.dayOfMonth,
      endDate: series.endDate,
      generatedThrough: series.generatedThrough,
      toIdx,
    });
    const template = templateFrom(series);
    for (const date of dates) await createTransaction({ ...template, eventDate: date }, tx);
    return dates.length;
  }, TX_OPTIONS);
}

/**
 * Completa as séries ativas da família até 12 meses à frente. Barato quando
 * não há nada a fazer (uma consulta). Erros de uma série não derrubam a tela.
 */
export async function ensureRecurringHorizon(householdId: string, today: Date = todayAsUtcDate()): Promise<number> {
  const toIdx = horizonIndex(today);
  const pending = await prisma.recurringSeries.findMany({
    where: { householdId, active: true, generatedThrough: { lt: toIdx } },
    select: { id: true },
  });
  let created = 0;
  for (const s of pending) {
    try {
      created += await generateForSeries(s.id, toIdx);
    } catch (e) {
      console.error(`Recorrência ${s.id}: não foi possível gerar ocorrências`, e);
    }
  }
  return created;
}

/**
 * Transforma um lançamento existente no primeiro de uma série mensal e gera
 * os meses seguintes até o horizonte.
 */
export async function convertToSeries(transactionId: string, householdId: string, endDate: Date | null, today: Date = todayAsUtcDate()) {
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, householdId } });
  if (!t) throw new TransactionError("Lançamento não encontrado.");
  if (t.recurringSeriesId) return { seriesId: t.recurringSeriesId, count: 0 };
  if (!CONSUMPTION_KINDS.includes(t.kind as TransactionKindValue)) throw new TransactionError("Só receitas, despesas e compras no cartão podem ser recorrentes.");
  if (t.installmentPurchaseId) throw new TransactionError("Compra parcelada não pode ser recorrente.");
  if (endDate && endDate.getTime() < t.eventDate.getTime()) throw new TransactionError("A data final precisa ser depois deste lançamento.");

  const series = await prisma.recurringSeries.create({
    data: {
      householdId,
      userId: t.userId,
      description: t.description,
      amountCents: t.amountCents,
      kind: t.kind,
      paymentMethod: t.paymentMethod,
      bankId: t.bankId,
      creditCardId: t.creditCardId,
      categoryId: t.categoryId,
      memberId: t.memberId,
      dayOfMonth: t.eventDate.getUTCDate(),
      startDate: t.eventDate,
      endDate,
      generatedThrough: monthIndex(t.eventDate),
      active: !seriesEnded(endDate, t.eventDate.getUTCDate(), monthIndex(t.eventDate)),
    },
  });
  await prisma.transaction.update({ where: { id: t.id }, data: { recurringSeriesId: series.id, isRecurring: true } });
  const count = await generateForSeries(series.id, Math.max(horizonIndex(today), monthIndex(t.eventDate)));
  return { seriesId: series.id, count };
}

/**
 * Altera esta ocorrência e as próximas da série, e o modelo da série (para os
 * meses que ainda serão gerados). Se o dia mudou, as próximas passam para o
 * novo dia, cada uma no seu mês.
 */
export async function updateSeriesFrom(transactionId: string, householdId: string, patch: UpdateTransactionInput) {
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, householdId }, include: { recurringSeries: true } });
  if (!t) throw new TransactionError("Lançamento não encontrado.");
  if (!t.recurringSeries) return updateTransaction(transactionId, householdId, patch);
  const series = t.recurringSeries;

  // Caminho rápido: mesma data, mesma forma de pagamento/conta/cartão e mesmo
  // sinal do valor (o tipo não muda). Aí basta um updateMany e recalcular as
  // faturas afetadas, em vez de atualizar ocorrência por ocorrência.
  const sameDate = !patch.eventDate || patch.eventDate.getTime() === t.eventDate.getTime();
  const sameLinks =
    (patch.paymentMethod === undefined || patch.paymentMethod === t.paymentMethod) &&
    (patch.bankId === undefined || (patch.bankId ?? null) === t.bankId || t.kind === "CARD_PURCHASE") &&
    (patch.creditCardId === undefined || (patch.creditCardId ?? null) === t.creditCardId || t.kind !== "CARD_PURCHASE");
  const sameSign = patch.amountCents === undefined || Math.sign(patch.amountCents) === Math.sign(t.amountCents) || t.kind === "CARD_PURCHASE";
  if (sameDate && sameLinks && sameSign) {
    const kind = t.kind as TransactionKindValue;
    const amountCents = patch.amountCents !== undefined ? normalizeSign(kind, Math.round(patch.amountCents)) : undefined;
    const ids = (
      await prisma.transaction.findMany({
        where: { recurringSeriesId: series.id, householdId, eventDate: { gte: t.eventDate } },
        select: { id: true, invoiceId: true },
      })
    );
    await prisma.$transaction(async (tx) => {
      await tx.transaction.updateMany({
        where: { id: { in: ids.map((o) => o.id) } },
        data: {
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.memberId !== undefined ? { memberId: patch.memberId } : {}),
          ...(amountCents !== undefined ? { amountCents, amount: fromCents(amountCents) } : {}),
        },
      });
      if (patch.settlementDate !== undefined) {
        await tx.transaction.update({ where: { id: t.id }, data: { settlementDate: patch.settlementDate } });
      }
      const invoiceIds = [...new Set(ids.map((o) => o.invoiceId).filter((v): v is string => !!v))];
      if (amountCents !== undefined) for (const inv of invoiceIds) await recalcInvoiceTotal(tx, inv);
      await tx.recurringSeries.update({
        where: { id: series.id },
        data: {
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
          ...(patch.memberId !== undefined ? { memberId: patch.memberId } : {}),
          ...(amountCents !== undefined ? { amountCents } : {}),
        },
      });
    }, TX_OPTIONS);
    return (await prisma.transaction.findUnique({ where: { id: t.id } }))!;
  }

  const newDay = patch.eventDate ? patch.eventDate.getUTCDate() : series.dayOfMonth;
  const occurrences = await prisma.transaction.findMany({
    where: { recurringSeriesId: series.id, householdId, eventDate: { gte: t.eventDate } },
    orderBy: { eventDate: "asc" },
    select: { id: true, eventDate: true },
  });

  const { eventDate: _ignored, settlementDate, ...shared } = patch;
  void _ignored;
  let edited = null;
  for (const occ of occurrences) {
    const isThis = occ.id === t.id;
    const date = isThis && patch.eventDate ? patch.eventDate : dateForMonth(monthIndex(occ.eventDate), newDay);
    const updated = await updateTransaction(occ.id, householdId, {
      ...shared,
      eventDate: date,
      ...(isThis && settlementDate !== undefined ? { settlementDate } : {}),
    });
    if (isThis) edited = updated;
  }

  if (edited) {
    await prisma.recurringSeries.update({
      where: { id: series.id },
      data: {
        description: edited.description,
        amountCents: edited.amountCents,
        kind: edited.kind,
        paymentMethod: edited.paymentMethod,
        bankId: edited.bankId,
        creditCardId: edited.creditCardId,
        categoryId: edited.categoryId,
        memberId: edited.memberId,
        dayOfMonth: newDay,
      },
    });
  }
  return edited!;
}

/**
 * Exclui esta ocorrência e as próximas, e encerra a série (não gera mais).
 * As ocorrências anteriores continuam como estão.
 */
export async function deleteSeriesFrom(transactionId: string, householdId: string) {
  const t = await prisma.transaction.findFirst({ where: { id: transactionId, householdId }, select: { id: true, eventDate: true, recurringSeriesId: true } });
  if (!t) return { deleted: 0 };
  if (!t.recurringSeriesId) return deleteTransaction(transactionId, householdId);

  const seriesId = t.recurringSeriesId;
  const occurrences = await prisma.transaction.findMany({
    where: { recurringSeriesId: seriesId, householdId, eventDate: { gte: t.eventDate } },
    select: { id: true, invoiceId: true },
  });
  // Ocorrências são sempre receita/despesa/compra no cartão (nunca transferência
  // ou pagamento de fatura), então basta apagar em lote e recalcular as faturas.
  const deleted = await prisma.$transaction(async (tx) => {
    const res = await tx.transaction.deleteMany({ where: { id: { in: occurrences.map((o) => o.id) } } });
    const invoiceIds = [...new Set(occurrences.map((o) => o.invoiceId).filter((v): v is string => !!v))];
    for (const inv of invoiceIds) await recalcInvoiceTotal(tx, inv);
    return res.count;
  }, TX_OPTIONS);

  const remaining = await prisma.transaction.count({ where: { recurringSeriesId: seriesId } });
  if (remaining === 0) {
    await prisma.recurringSeries.delete({ where: { id: seriesId } });
  } else {
    await prisma.recurringSeries.update({
      where: { id: seriesId },
      data: { active: false, endDate: new Date(t.eventDate.getTime() - 86400000) },
    });
  }
  return { deleted };
}
