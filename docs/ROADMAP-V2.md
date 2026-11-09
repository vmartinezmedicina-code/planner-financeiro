# Planner Financeiro — Roadmap V2

Implementação incremental, em commits pequenos. Cada fase termina com
`npm run typecheck && npm run lint && npm test && npm run build`, revisão das migrations,
resumo das mudanças e riscos restantes. Produção continua funcionando o tempo todo.

Legenda: ☐ a fazer · ◐ em andamento · ☑ feito

## Fase 0 — Documentação e auditoria ☑
- ☑ Mapear código, APIs, regras, dashboard, planejamento, lançamentos/importação, relatórios, auth, IA.
- ☑ `docs/ARCHITECTURE-V2.md`, `docs/DATA-MODEL-V2.md`, `docs/ROADMAP-V2.md`.
- ☑ Runner de testes (`node:test` via `tsx`, sem dependência nova).

## Fase 1 — Fundação financeira ☑ (em produção desde 08/11/2026)
1.1 ☑ `src/lib/money.ts` + testes (reais↔centavos, soma, parcelas, arredondamento).
1.2 ☑ Schema aditivo + migrations (`v2_foundation`, `v2_backfill`) + script `db:backfill-v2`.
1.3 ☑ `TransactionKind`/`TransactionSource` + `src/lib/finance/kinds.ts`; escrita dupla (`amount` e `amountCents`) em todas as rotas que gravam dinheiro; leitura de planejamento/dashboard filtra kinds de consumo.
1.4 ☑ Família: `Household`/`HouseholdMember`, `householdId` na sessão e nas rotas (escopo), membro opcional no lançamento, gestão de membros em **Conta**.
1.5 ☑ Transferências: `POST /api/transfers` (par de lançamentos `TRANSFER`), ação em **Bancos**.
1.6 ☑ Faturas: `CreditCardInvoice`, `invoiceService` (período/fechamento/vencimento, status derivado), atribuição automática ao criar compra no cartão, backfill, listagem em **Cartões**.
1.7 ☑ Pagar fatura: `POST /api/invoices/:id/pay` (cria `CARD_PAYMENT`, marca fatura paga), dashboard usa faturas.
1.8 ☑ Sessão: `sessionVersion` no JWT; trocar senha invalida sessões anteriores (janela ≤ 60 s de cache).
1.9 ☑ Testes de domínio: fechamento antes/depois, virada dez/jan, parcelas, pagamento, transferência, saldo.

## Fase 2 — Dashboard 2.0
- Cabeçalho `‹ Mês ›` com "hoje" e "+ lançamento"; 4 KPIs principais; KPIs secundários discretos.
- `AnalyticsDrawer` (painel lateral/modal) com drill-down recursivo por categoria.
- Próximos vencimentos e projeção curta. `getDashboardData` com queries por intervalo + agregação em memória.
- Dividir `DashboardBoard` em `DashboardHeader`, `DashboardKpis`, `DashboardCashFlow`, `DashboardUpcoming`.

Estado: ☑ código pronto (sem mudança de banco; basta `git push`). O que foi decidido na implementação:
- **Saldo real × agendado:** o saldo considera só lançamentos com data de caixa (efetivação, ou evento) até hoje;
  os de data futura aparecem como "agendado" e entram na projeção. Vale também para a tela Bancos.
- **Competência do mês** continua contando tudo que foi lançado com data no mês (inclusive datas futuras),
  o que serve ao orçamento. "Receitas previstas" = o que ainda não entrou (lançado no futuro ou planejado e não lançado).
- **Indicador = detalhe:** receitas/despesas do dashboard usam o mesmo cálculo do drill-down
  (`analytics/categoryTree`), incluindo lançamentos sem categoria.
- **Próximos vencimentos** derivam do que já está lançado (faturas não pagas + lançamentos futuros). O cadastro de
  compromissos recorrentes (`FinancialCommitment`) fica para a Fase 5.
- **Saiu do dashboard:** o gráfico de parcelas (foi para o painel de Cartões) e o "extrato mensal consolidado"
  (planejado × realizado está no drill-down, em Planejamento e em Relatórios).

## Fase 3 — Análises (BI)
- Renomear "Relatórios" → "Análises" (export vira ação secundária).
- Filtros globais; visões: geral, despesas, receitas, cartões, fluxo (competência × caixa), planejamento, patrimônio.
- `src/lib/analytics/`: `categoryAnalytics` (mês, anterior, média 3/6, mediana, min/máx, nº, ticket médio/mediano),
  `weekly` (seg–dom, comparação mês a mês), `behaviorInsights` + `insights/*` (regras determinísticas, com limiar de histórico).

## Fase 4 — Metas
- `FinancialGoal`, `GoalContribution`; `goalCalculator` (restante, meses, mensal, semanal, %).
- `GoalsBoard`, `GoalWizard`, `GoalSimulation` (cenários no cliente, sem salvar), impacto no fluxo livre; planejamento de compra (à vista × parcelado).

## Fase 5 — Agenda
- `FinancialCommitment`; visões mês/7 dias/30 dias/atrasados; marcar como pago cria/vincula lançamento.
- Projeção de caixa 7/30/60/90 dias (realizado × projetado separados).

## Fase 6 — Importação
- `ImportSession`/`ImportItem` (staging, estados), CSV/PDF/imagem/câmera, tela de conferência, `sourceHash` + deduplicação em três níveis, sugestão de instituição (nunca criar automaticamente).

## Fase 7 — Inteligência
- `Merchant`/`MerchantAlias` com aprendizado por correção; `CategorizationRule` (regra → histórico → IA);
  `src/lib/ai/` (provider com modelo via env, schemas, prompts, vision); assistente alimentado pela camada analítica.

## Fase 8 — Patrimônio
- Contas × investimentos × dívidas; `NetWorthSnapshot`; evolução; metas patrimoniais.

## Fase 9 — Limpeza
- Migration final: remover colunas `Float` após confirmação em produção; `AuditLog`; soft delete (`deletedAt`) com restauração.

---

## Plano de implementação — Fase 1

### Novos
```
src/lib/money.ts
src/lib/finance/kinds.ts
src/lib/finance/transactionService.ts
src/lib/finance/transfers.ts
src/lib/invoices/invoiceService.ts
src/lib/household/householdService.ts
src/app/api/transfers/route.ts
src/app/api/invoices/route.ts
src/app/api/invoices/[id]/pay/route.ts
src/app/api/household/members/route.ts
src/app/api/household/members/[id]/route.ts
src/components/banks/TransferDialog.tsx
src/components/creditcards/InvoiceList.tsx
src/components/creditcards/PayInvoiceDialog.tsx
src/components/account/MembersSection.tsx
scripts/backfill-v2.ts
prisma/migrations/20260820020000_v2_foundation/migration.sql
prisma/migrations/20260820020100_v2_backfill/migration.sql
tests/money.test.ts, tests/invoices.test.ts, tests/kinds.test.ts, tests/transfers.test.ts
```

### Modificados
```
prisma/schema.prisma                         enums e campos novos (aditivo)
package.json                                 scripts test/typecheck/db:backfill-v2
src/lib/auth.ts                              householdId + sv no JWT; verificação de sessionVersion
src/app/api/auth/{login,password}/route.ts   emitir sv; bump ao trocar senha
src/lib/planning.ts, src/lib/dashboard.ts    filtrar kinds de consumo; faturas por CreditCardInvoice
src/lib/financialContext.ts                  usar serviços (sem N+1)
src/app/api/transactions/{route,[id],bulk,import,parse}  kind/amountCents/source/memberId/invoiceId/escopo
src/app/api/installments/route.ts            CARD_PURCHASE + invoiceId por parcela; totalAmountCents
src/app/api/recurring/generate/route.ts      copiar kind/amountCents/memberId; reatribuir fatura
src/app/api/banks/*, credit-cards/*, planned-values, investments/*, categories/*  cents + escopo
src/app/(app)/{bancos,cartoes,conta,lancamentos}/page.tsx
src/components/transactions/{TransactionForm,TransactionsBoard}.tsx   membro; badge de kind; itens TRANSFER/CARD_PAYMENT
src/components/banks/BanksBoard.tsx          botão Transferir
src/components/creditcards/CreditCardsBoard.tsx  faturas + pagar
src/components/account/AccountBoard.tsx      seção Família
prisma/seed.ts                               household/membros
```

### Plano de preservação de dados
- Nenhuma coluna é removida ou renomeada. Nenhum `DROP`. Nenhum rebuild de tabela.
- Colunas novas entram com `DEFAULT` ou `NULL`; backfill por `UPDATE` idempotente.
- `amount` (Float) continua sendo gravado em todas as escritas; se algo falhar, a V1 continua lendo normalmente.
- Faturas só são **criadas**; compras existentes recebem `invoiceId` por script que pode ser reexecutado.
- Rollback: a aplicação anterior funciona sobre o schema novo (ignora as colunas extras).
