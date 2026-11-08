# Planner Financeiro — Modelo de dados V2

Convenções: valores monetários em **centavos inteiros** (`*Cents`); datas em UTC;
campos `Float` antigos permanecem como espelho até a migration final (Fase 9).

## Enums
```
TransactionKind    INCOME | EXPENSE | TRANSFER | CARD_PURCHASE | CARD_PAYMENT | ADJUSTMENT
TransactionSource  MANUAL | TEXT_AI | IMAGE | PDF | CSV | IMPORT | SYSTEM
InvoiceStatus      OPEN | CLOSED | PAID | PARTIAL | OVERDUE
(V1, mantidos)     CategoryType, TransactionStatus, PaymentMethod
```

## Família
```
Household         id, name, createdAt
HouseholdMember   id, householdId, name, userId? (único; vínculo opcional com login), color, order, isActive
User              + householdId?, + sessionVersion (Int, default 0), + member (1:1 opcional)
```
Backfill: cria `hh_default` ("Família"), aponta todos os usuários e registros para ele e cria um
membro por usuário (`mem_<userId>`). Membros sem login (ex.: "Helena", "Casa") são criados pela UI.

## Lançamento (Transaction) — campos novos
```
kind             TransactionKind  default EXPENSE   (backfill: cartão → CARD_PURCHASE; amount ≥ 0 → INCOME; senão EXPENSE)
amountCents      Int              default 0         (backfill: ROUND(amount*100))
source           TransactionSource default MANUAL
householdId?     → Household
memberId?        → HouseholdMember   (a quem pertence; `userId` continua sendo quem lançou)
transferGroupId? String             (une os dois lados de uma transferência)
invoiceId?       → CreditCardInvoice (só CARD_PURCHASE)
índices: kind, householdId+eventDate, invoiceId, transferGroupId, memberId
```
Regras por `kind` (impostas por `src/lib/finance/kinds.ts` + `transactionService`):
| kind | bankId | creditCardId | invoiceId | categoria | entra em planejamento/BI | mexe saldo conta |
|---|---|---|---|---|---|---|
| INCOME | sim | não | não | RECEITA | sim | sim |
| EXPENSE | sim | não | não | DESPESA | sim | sim |
| CARD_PURCHASE | não | sim | sim | DESPESA | sim | não |
| CARD_PAYMENT | sim | sim (ref.) | sim (fatura paga) | não | não | sim |
| TRANSFER | sim | não | não | não | não | sim (um lado −, outro +) |
| ADJUSTMENT | sim | não | não | não | não | sim |

## Fatura de cartão
```
CreditCardInvoice  id, householdId?, creditCardId, referenceYear, referenceMonth,
                   openingDate, closingDate, dueDate, status, totalCents, paidCents,
                   paidAt?, paymentBankId?, paymentTransactionId?, createdAt, updatedAt
                   @@unique(creditCardId, referenceYear, referenceMonth)
```
Período (UTC), com `closingDay = C` e `dueDay = D` do cartão:
- Compra no dia `d` do mês `M`: se `d <= C` → fatura de referência `M`; senão → `M+1`.
  (Dia de fechamento inclusivo; `C` ajustado ao último dia do mês quando maior.)
- `closingDate` = dia `C` do mês de referência; `openingDate` = dia seguinte ao fechamento anterior.
- `dueDate` = dia `D` do mês de referência se `D > C`, senão dia `D` do mês seguinte.
- Sem `closingDay`: usa o último dia do mês da compra como fechamento. Sem `dueDay`: vence dia 10 do mês seguinte.
- Status derivado na leitura: `PAID`/`PARTIAL` persistidos; `OPEN` (hoje ≤ closingDate), `CLOSED` (fechada, não vencida), `OVERDUE` (venceu sem pagamento).

## Outros modelos — campos novos
```
Bank                + initialBalanceCents, + householdId?
CreditCard          + householdId?, invoices[]
Category            + householdId?
PlannedValue        + amountCents, + householdId?
InstallmentPurchase + totalAmountCents, + householdId?
Investment          + contributedAmountCents, + currentValueCents, + householdId?
```

## Modelos previstos em fases seguintes (não criados ainda)
- Fase 4: `FinancialGoal`, `GoalContribution`.
- Fase 5: `FinancialCommitment`.
- Fase 6: `ImportSession`, `ImportItem` (+ `sourceHash` em Transaction).
- Fase 7: `Merchant`, `MerchantAlias`, `CategorizationRule` (+ `merchantId` em Transaction).
- Fase 8: `NetWorthSnapshot`.
- Transversal: `AuditLog`, `deletedAt` (soft delete).

## Migrations da Fase 1
1. `20260820020000_v2_foundation` — DDL aditivo (tabelas, colunas NULL/default, índices). Sem rebuild de tabela.
2. `20260820020100_v2_backfill` — UPDATE/INSERT idempotentes: household padrão, membros, `kind`, `*Cents`.
3. `npm run db:backfill-v2` — script TypeScript idempotente: cria/atribui faturas às compras de cartão existentes
   (precisa de lógica de calendário, por isso fora do SQL). Roda contra local ou Turso conforme `DATABASE_URL`.

Ordem em produção: `npm run db:deploy-turso` → `npm run db:backfill-v2` → `git push`.
