# Planner Financeiro — contexto técnico (para continuar o desenvolvimento)

App web de finanças pessoais/familiares para 2 usuários (casal), protegido por login.
Produção: https://planner-financeiro-three.vercel.app · Repositório: github.com/vmartinezmedicina-code/planner-financeiro (branch `main`).

## Stack
- Next.js 16 (App Router, Turbopack; `src/proxy.ts` no lugar de middleware), React 19, TypeScript.
- Tailwind 4 (variáveis CSS em `src/app/globals.css`, modo escuro por classe `.dark`).
- Prisma 6.19 (fixado; Prisma 7 exige adapters). SQLite local (`prisma/dev.db`); Turso/libSQL em produção via `@prisma/adapter-libsql`, usado só quando `DATABASE_URL` começa com `libsql:` (`src/lib/prisma.ts`).
- recharts (gráficos), lucide-react (ícones), exceljs (relatório Excel), zod (validação), bcryptjs + jsonwebtoken (auth), `@anthropic-ai/sdk` (IA).

## Hospedagem e deploy
- Vercel (deploy automático a cada push em `main`) + Turso (banco). Mudanças só de código não tocam nos dados.
- Mudou o schema? Ordem: (1) `prisma db push` local; (2) criar pasta em `prisma/migrations/<timestamp>_<nome>/migration.sql` (gerada com `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`); (3) `prisma migrate resolve --applied <nome>`; (4) rodar no PowerShell, com `DATABASE_URL` e `TURSO_AUTH_TOKEN` definidos, `npm run db:deploy-turso` (usa tabela `_deploy_migrations` para pular o que já foi aplicado); (5) só então `git push`.
- `prisma migrate dev` não funciona (não interativo). Build da Vercel roda `prisma generate && next build` (o cliente em cache causou falha antes).
- Variáveis de ambiente: `DATABASE_URL`, `TURSO_AUTH_TOKEN`, `JWT_SECRET`, `ANTHROPIC_API_KEY` (ver se está na Vercel), e para o seed `SEED_USER1/2_EMAIL/PASSWORD`.

## Modelo de dados (`prisma/schema.prisma`)
User (inclui `failedLogins`, `lockedUntil`), Bank (`initialBalance`), CreditCard (`dueDay`), Category (árvore por `parentId`, tipo RECEITA/DESPESA), PlannedValue (planejado por categoria/mês), Transaction (`amount` com sinal, `paymentMethod`, `bankId`, `creditCardId`, `status` PENDENTE/..., `isRecurring`, `installmentPurchaseId`, `installmentNumber`), InstallmentPurchase, Investment.

## Regras de negócio importantes
- **Forma de pagamento** (`src/lib/paymentMethod.ts`, `resolvePaymentLinks`): CRÉDITO vai só para a fatura do cartão (sem `bankId`); DÉBITO/PIX/DINHEIRO só para o saldo do banco (sem `creditCardId`). Imposto no servidor.
- Saldo do banco = `initialBalance` + soma dos lançamentos com `bankId`. Fatura em aberto = lançamentos do cartão com status PENDENTE.
- Compra parcelada: cria N lançamentos mensais ligados a um `InstallmentPurchase`.
- Recorrentes: `POST /api/recurring/generate` copia do mês anterior os `isRecurring` não parcelados, com deduplicação.
- Valores de despesa são negativos em `amount`; relatórios usam valor absoluto.

## Autenticação e segurança
- Cookie httpOnly `planner_session` com JWT (30 dias). `src/proxy.ts` protege tudo exceto `/login` e `/api/auth/login`.
- Bloqueio de 15 min após 5 senhas erradas (`/api/auth/login`). Troca de senha em `/conta` (`/api/auth/password`, mínimo 10 caracteres).
- Limitação conhecida: trocar a senha não invalida sessões JWT já emitidas.

## Mapa do código
- Páginas: `src/app/(app)/` → dashboard (`page.tsx`), lancamentos, planejamento, bancos, cartoes, parcelamentos, investimentos, relatorios, assistente, conta. Login em `src/app/login`.
- APIs: `src/app/api/` → auth, banks, credit-cards, categories, planned-values, planning, transactions (+ parse, bulk, import, export, auto-categorize), installments, investments, dashboard, recurring/generate, reports/excel, assistant/chat.
- Lógica: `src/lib/` → `dashboard.ts` (dados do painel), `planning.ts` (árvore planejado x realizado), `financialContext.ts` (contexto para a IA), `categories.ts`, `format.ts`, `paymentMethod.ts`, `auth.ts`, `prisma.ts`.
- Telas (client components): `src/components/<módulo>/…Board.tsx`; navegação em `AppNav.tsx` (menu lateral agrupado + barra inferior no celular com "Mais").
- IA: lançamento por texto (`/api/transactions/parse`, saída estruturada em JSON) e chat (`/api/assistant/chat`). Dependem de `ANTHROPIC_API_KEY`.

## Dashboard atual
Quatro cartões de total que abrem o detalhe ao clicar: Saldo em contas (por conta), Receitas do mês e Despesas do mês (por categoria → subcategoria), Cartões de crédito (fatura em aberto por cartão). Abaixo: evolução de 6 meses, parcelas dos próximos 6 meses e o "Extrato mensal consolidado" recolhível, onde fica o seletor de mês.

## Evolução V2 (em andamento)
Especificação e plano em `docs/` (`ARCHITECTURE-V2.md`, `DATA-MODEL-V2.md`, `ROADMAP-V2.md`, `DEPLOY-V2-FASE1.md`).
Fase 1 (fundação) está pronta no código e **ainda não aplicada em produção**:
- Dinheiro em centavos inteiros (`*Cents`, `src/lib/money.ts`); os campos `Float` continuam gravados como espelho.
- `Transaction.kind` (INCOME, EXPENSE, CARD_PURCHASE, CARD_PAYMENT, TRANSFER, ADJUSTMENT) e `source`; regras em `src/lib/finance/kinds.ts`; toda escrita passa por `src/lib/finance/transactionService.ts`.
- Família: `Household`/`HouseholdMember`; `householdId` em todos os registros e em toda rota; `memberId` opcional no lançamento.
- Faturas: `CreditCardInvoice` (`src/lib/invoices/`), fechamento pelo `closingDay`, pagar fatura cria `CARD_PAYMENT`.
- Transferências entre contas (`src/lib/finance/transfers.ts`, `POST /api/transfers`).
- Sessão com `sessionVersion`: trocar a senha derruba as outras sessões.
- Testes: `npm test` (node:test + tsx), incluindo integração contra SQLite temporário.
- Migrations da V2 são escritas à mão (só `ADD COLUMN`/`CREATE`), nunca o `RedefineTables` do Prisma.

## Estado atual (08/11/2026)
Funcionando em produção: login com bloqueio, troca de senha, planejamento, lançamentos (inclusive por texto/IA), bancos, cartões, parcelamentos, investimentos, relatórios (Excel/PDF), assistente, dashboard novo.

## Pendências e ideias
- Trocar as senhas dos 2 usuários em produção; confirmar `ANTHROPIC_API_KEY` na Vercel; gerar novo token do Turso (o atual apareceu em print) e atualizar na Vercel.
- Cadastrar as contas em Bancos no site publicado (hoje 0 contas).
- Pagar fatura (debitar da conta), transferência entre contas, identificar quem fez cada lançamento.
- Metas de economia, importação de extrato, alertas por e-mail, evolução do patrimônio, backup periódico do Turso.
- Ainda não publicado: ajuste do formulário de login (`name`/`autocomplete` para gerenciadores de senha).

## Convenções do projeto
- Interface em português do Brasil, mobile-first, tema escuro suportado.
- Commits com autor "Harvey"; push feito pelo usuário no PowerShell (credencial do GitHub já deu conflito de conta antes).
