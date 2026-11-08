# Planner Financeiro — Arquitetura V2

Documento vivo. Descreve o estado atual do sistema (auditoria da V1), o que
é mantido, os débitos técnicos e a arquitetura-alvo da V2. O plano de fases
está em `ROADMAP-V2.md`; o modelo de dados em `DATA-MODEL-V2.md`.

## 1. Diagnóstico da V1 (auditoria de 08/11/2026)

### 1.1 Stack (mantida integralmente)
- Next.js 16 (App Router, Turbopack, `src/proxy.ts` no lugar de middleware), React 19, TypeScript estrito.
- Tailwind 4 com tema por variáveis CSS (`src/app/globals.css`), modo escuro por classe.
- Prisma 6.19 (fixado), SQLite local; Turso/libSQL em produção via `@prisma/adapter-libsql`
  (ativado só quando `DATABASE_URL` começa com `libsql:`).
- Recharts, lucide-react, exceljs, zod, bcryptjs + jsonwebtoken, `@anthropic-ai/sdk`.
- Hospedagem: Vercel (deploy automático em push na `main`) + Turso.

### 1.2 Mapa do código
| Área | Arquivos | Observações |
|---|---|---|
| Autenticação | `src/lib/auth.ts`, `src/proxy.ts`, `api/auth/{login,logout,password}` | JWT em cookie httpOnly (30 dias). Bloqueio de 15 min após 5 erros. Sem `sessionVersion`: trocar senha não derruba sessões. |
| Dados | `prisma/schema.prisma`, `src/lib/prisma.ts` | 8 modelos. Todos os valores monetários em `Float`. Sem conceito de família. |
| Regras de pagamento | `src/lib/paymentMethod.ts` (`resolvePaymentLinks`) | CRÉDITO → só `creditCardId`; demais → só `bankId`. Imposto no servidor em create/update/import. |
| Lançamentos | `api/transactions/*` (CRUD, bulk, import CSV, export CSV, auto-categorize, parse IA), `components/transactions/*` | `amount` com sinal (negativo = despesa). `TransactionsBoard` (758 linhas) e `TransactionForm` (319) concentram UI e chamadas. Import CSV cria banco/cartão automaticamente se o nome for novo (risco de duplicidade). |
| Parcelamentos | `api/installments/*`, `components/installments/*` | Cria N `Transaction` ligadas a `InstallmentPurchase`; centavos de arredondamento na última parcela. |
| Recorrentes | `api/recurring/generate` | Copia do mês anterior com deduplicação por chave textual. |
| Bancos | `api/banks/*`, `(app)/bancos`, `components/banks/*` | Saldo = `initialBalance` + soma dos lançamentos com `bankId`. Uma query por banco. |
| Cartões | `api/credit-cards/*`, `(app)/cartoes`, `components/creditcards/*` | "Fatura" = todos os lançamentos do cartão (sem fechamento); dashboard usa só os PENDENTE. Não há entidade de fatura nem ação de pagar. |
| Planejamento | `src/lib/planning.ts`, `api/planning`, `api/planned-values`, `api/categories/*`, `components/planning/*` | Árvore de categorias recursiva (profundidade ilimitada). Planejado × realizado por mês. Realizado soma `|amount|` de todo lançamento com categoria. |
| Dashboard | `src/lib/dashboard.ts`, `components/dashboard/DashboardBoard.tsx` (444 linhas) | 4 cartões clicáveis + evolução 6 meses + parcelas + extrato mensal recolhível (onde ficou o seletor de mês). ~20 queries sequenciais (loop por mês/banco/cartão). |
| Relatórios | `api/reports/excel`, `(app)/relatorios`, `components/reports/*` | Excel (3 abas) e impressão/PDF. |
| Investimentos | `api/investments/*`, `components/investments/*` | Aportes com valor atual manual. Sem histórico/snapshots. |
| IA | `api/transactions/parse` (structured output), `api/assistant/chat`, `src/lib/financialContext.ts` | SDK chamado diretamente em 2 rotas; modelo `claude-opus-5` hardcoded nas duas. Contexto textual montado com queries próprias (N+1). |
| Deploy de banco | `scripts/deploy-turso.ts`, `prisma/migrations/*` | Aplica `migration.sql` em ordem; tabela `_deploy_migrations` evita reaplicar. `prisma migrate dev` não funciona (não interativo). |

### 1.3 O que é mantido
- Toda a stack, o layout, o tema, a navegação agrupada e a barra inferior mobile.
- A regra CRÉDITO/DÉBITO de `resolvePaymentLinks` (passa a derivar `TransactionKind`).
- A árvore de categorias e `getPlanningData` (passa a filtrar por `kind`).
- Rotina de migrations: `prisma db push` local → SQL em `prisma/migrations/<ts>_<nome>/migration.sql`
  → `prisma migrate resolve --applied` → `npm run db:deploy-turso` em produção → só então `git push`.
- Lançamento por texto, assistente, Excel, CSV, parcelamentos, recorrentes.

### 1.4 Débitos técnicos
1. **Float em dinheiro.** Somas longas acumulam erro de ponto flutuante; comparações de igualdade (recorrentes) são frágeis.
2. **Sem tipo de lançamento.** Transferência entre contas ou pagamento de fatura, se lançados hoje, contam como despesa/receita e distorcem planejamento e BI.
3. **Fatura de cartão sem fechamento.** "Fatura aberta" é a soma de pendentes de todos os tempos; não há vencimento real por fatura nem ação de pagar.
4. **Sem família/membros.** Só `userId` (quem lançou). Não há "a quem pertence" nem membros sem login.
5. **Sessão não revogável.** JWT sem versão.
6. **Sem escopo de autorização.** Rotas não filtram por família (há uma só, mas o modelo não protege).
7. **Queries N+1** em dashboard, bancos, cartões e `financialContext`.
8. **Componentes grandes** (`TransactionsBoard`, `DashboardBoard`).
9. **Import CSV cria instituições automaticamente** e grava direto, sem conferência nem deduplicação.
10. **IA acoplada** às rotas; modelo hardcoded; contexto montado por texto.
11. **Sem testes** de regras financeiras.
12. **`Transaction.status`** mistura "pendente/pago/confirmado" de conta com "está na fatura" de cartão.

### 1.5 Risco das migrations
- SQLite (local e Turso) só permite `ALTER TABLE ADD COLUMN`; colunas novas com FK precisam ser `NULL` por padrão (permitido).
  **Evitar** migrations que recriem tabela (Prisma gera `PRAGMA foreign_keys=OFF` + copiar + renomear), pois o
  script de deploy executa instrução a instrução via HTTP e PRAGMAs podem não ser honrados no Turso.
- Datas em SQLite via Prisma são **inteiros (ms Unix)**. Backfills em SQL que criem datas devem usar
  `CAST(strftime('%s','now') AS INTEGER) * 1000`, nunca `CURRENT_TIMESTAMP`.
- Enums são `TEXT`. Novos valores de enum não exigem migration de dados.
- Toda migration da V2 é **aditiva**: colunas/tabelas novas + backfill. Remoção de colunas `Float`
  só em migration final, após validação em produção (ver ROADMAP).

## 2. Arquitetura-alvo da V2

### 2.1 Princípio
Três níveis: **situação** (dashboard limpo) → **explicação** (drill-down sob demanda) → **planejamento/decisão**
(metas, agenda, projeção). Cálculo financeiro sempre determinístico, no servidor, em centavos inteiros.
IA só interpreta, extrai, sugere e explica.

### 2.2 Camadas
```
src/lib/
  money.ts              reais↔centavos, soma, divisão de parcelas, formatação
  finance/              kinds.ts (TransactionKind + filtros), transactionService.ts, transfers.ts
  invoices/             invoiceService.ts (fechamento, vencimento, pagar fatura)
  household/            householdService.ts (família, membros, escopo)
  analytics/            categoryAnalytics.ts, weekly.ts, behaviorInsights.ts, insights/*
  goals/                goalCalculator.ts
  calendar/             commitments.ts, cashFlowProjection.ts
  imports/              importService.ts, dedupe.ts, normalize.ts
  ai/                   provider.ts (modelo via env), schemas.ts, prompts.ts, parser.ts
src/app/api/            rotas finas: validam com zod, resolvem sessão/escopo, chamam serviços
src/components/         UI por módulo; componentes pequenos
tests/                  testes de domínio (node:test via tsx)
```

### 2.3 Regras de integridade (invariantes)
- `amountCents` é a fonte da verdade; `amount` (Float) é espelho até a migration final.
- `kind` define semântica:
  - `INCOME` / `EXPENSE`: consumo via conta (`bankId`), entram em planejamento e BI.
  - `CARD_PURCHASE`: despesa no cartão (`creditCardId` + `invoiceId`), entra em planejamento e BI, **não** mexe no saldo da conta.
  - `CARD_PAYMENT`: saída da conta que quita fatura; mexe no saldo, **não** é despesa.
  - `TRANSFER`: par de lançamentos (`transferGroupId`), mexe nos saldos, **não** é receita/despesa.
  - `ADJUSTMENT`: correção de saldo; mexe no saldo, fora do BI de consumo.
- Saldo da conta = `initialBalanceCents` + Σ `amountCents` dos lançamentos com `bankId` (todos os kinds).
- Fatura = Σ `amountCents` dos `CARD_PURCHASE` com aquele `invoiceId`. Período definido por `closingDay` (ver DATA-MODEL).
- Todo registro financeiro tem `householdId`; toda rota filtra pelo household da sessão.

### 2.4 Sessão e autorização
- JWT carrega `userId`, `householdId`, `sv` (sessionVersion). `getSession()` confere `sv` contra o banco
  (cache em memória de 60 s por usuário) e rejeita sessões antigas após troca de senha.
- As rotas usam `householdId` da sessão em todo `where`/`create`.

### 2.5 Performance
- `getDashboardData` e análogos passam a buscar intervalos inteiros (`findMany` por período) e agregar em memória;
  `Promise.all` para consultas independentes. Índices novos: `Transaction(kind)`, `(householdId, eventDate)`, `(invoiceId)`, `(transferGroupId)`.
