# Planner Financeiro

Controle financeiro pessoal/familiar, protegido por login, para uso exclusivo
entre 2 usuários (você e sua esposa). Inclui planejamento mensal por
categorias, lançamentos, dashboard de acompanhamento e controle de
investimentos.

## Stack

- **Framework:** Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS 4
- **Banco de dados:** SQLite local (via Prisma) — em produção, [Turso](https://turso.tech) (SQLite compatível, com plano gratuito, persistente em ambiente serverless)
- **Autenticação:** login com e-mail/senha, sessão em cookie httpOnly assinado (JWT). Apenas as 2 contas cadastradas via seed — sem cadastro público.
- **Gráficos:** Recharts

## Rodando localmente

### 1. Pré-requisitos

- Node.js 20+
- npm

### 2. Instalar dependências

```bash
npm install
```

### 3. Configurar variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

- `DATABASE_URL`: pode deixar `file:./dev.db` para rodar local.
- `JWT_SECRET`: gere um valor aleatório com:
  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
  ```
- `SEED_USER1_EMAIL` / `SEED_USER1_PASSWORD`: seu e-mail e senha.
- `SEED_USER2_EMAIL` / `SEED_USER2_PASSWORD`: e-mail e senha da sua esposa.

### 4. Criar o banco e os 2 usuários

```bash
npx prisma migrate dev --name init
npm run db:seed
```

Isso cria o banco SQLite local, os 2 usuários definidos no `.env` e a árvore
de categorias/subcategorias padrão (Receitas e Despesas Mensais).

### 5. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) e faça login com um dos
e-mails/senhas configurados no `.env`.

> **Trocar a senha depois:** o jeito mais simples é rodar novamente
> `npm run db:seed` após atualizar `SEED_USER1_PASSWORD`/`SEED_USER2_PASSWORD`
> no `.env` — o seed atualiza apenas o hash da senha do usuário existente
> (por e-mail), sem duplicar contas.

## Estrutura dos módulos

| Módulo | Rota | O que faz |
|---|---|---|
| Dashboard | `/` | Saldo do período, comparativo planejado x realizado, evolução mensal (gráfico), totais por banco/cartão |
| Planejamento | `/planejamento` | Árvore de categorias/subcategorias com CRUD, valores planejados por mês, abas Planejado/Realizado |
| Lançamentos | `/lancamentos` | Listagem com filtros, CRUD, ações em lote, importação/exportação CSV, categorização automática |
| Bancos | `/bancos` | Cadastro de bancos/contas com saldo inicial; saldo atual é recalculado automaticamente a partir dos lançamentos vinculados |
| Cartões de Crédito | `/cartoes` | Cadastro de cartões; fatura atual soma todos os lançamentos vinculados (inclusive pendentes), com detalhamento por categoria |
| Investimentos | `/investimentos` | Cadastro de aportes e resumo consolidado da carteira |
| Assistente IA | `/assistente` | Chat com a IA da Anthropic (Claude) com contexto dos seus dados financeiros — requer `ANTHROPIC_API_KEY` no `.env` |

### Sobre o Assistente IA

O chat usa a [API da Anthropic](https://console.anthropic.com) (modelo `claude-opus-5`), que é **paga por uso** e
precisa de uma chave própria. Sem `ANTHROPIC_API_KEY` configurada no `.env`, a tela mostra um aviso e o resto do
app continua funcionando normalmente. A cada mensagem, o servidor monta um resumo com saldo do mês, planejado vs.
realizado, saldos dos bancos, faturas dos cartões e totais de investimentos, e envia isso como contexto — a IA não
tem acesso direto ao banco de dados, só a esse resumo.

### Sobre a "categorização automática" dos lançamentos

O botão **Regras automáticas** não é um motor de regras configurável — ele
procura, na descrição de cada lançamento sem categoria, o nome de alguma
categoria/subcategoria já cadastrada e aplica a correspondência mais
específica encontrada. É um ponto de partida rápido; ajustes finos continuam
possíveis por edição individual ou em lote.

## Deploy em produção (Vercel + Turso)

O app roda em serverless na Vercel, que **não** mantém um disco persistente —
por isso, em produção o banco precisa estar em um serviço externo. Como o
projeto usa SQLite, a opção mais simples e compatível é o
[Turso](https://turso.tech): mesmo dialeto SQL, plano gratuito, e o Prisma já
está configurado para usá-lo automaticamente quando `DATABASE_URL` apontar
para lá (veja [src/lib/prisma.ts](src/lib/prisma.ts)).

### 1. Criar o banco no Turso

```bash
npm install -g @turso/cli   # ou: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup           # ou "turso auth login" se já tiver conta
turso db create planner-financeiro
turso db show planner-financeiro --url         # copie a URL (libsql://...)
turso db tokens create planner-financeiro      # copie o token
```

### 2. Aplicar o schema no banco do Turso

O Prisma Migrate não fala diretamente com URLs `libsql://`, então geramos o
SQL localmente e aplicamos via `turso db shell`:

```bash
# gera/atualiza as migrations em prisma/migrations (já existe uma "init")
npx prisma migrate dev

# aplica todas as migrations no banco do Turso
turso db shell planner-financeiro < prisma/migrations/*/migration.sql
```

Se houver mais de uma pasta de migration, aplique cada `migration.sql` em
ordem cronológica (nome da pasta começa com a data/hora).

### 3. Rodar o seed apontando para o Turso

```bash
DATABASE_URL="libsql://SEU-BANCO.turso.io" \
TURSO_AUTH_TOKEN="SEU_TOKEN" \
JWT_SECRET="qualquer-coisa-para-rodar-o-seed" \
SEED_USER1_EMAIL="voce@..." SEED_USER1_PASSWORD="..." \
SEED_USER2_EMAIL="esposa@..." SEED_USER2_PASSWORD="..." \
npm run db:seed
```

(No Windows/PowerShell, defina cada variável com `$env:NOME="valor"` antes do
comando, em vez do prefixo `VAR=valor`.)

### 4. Deploy na Vercel

1. Suba o projeto para um repositório no GitHub/GitLab.
2. Em [vercel.com](https://vercel.com), importe o repositório.
3. Em **Environment Variables**, configure:
   - `DATABASE_URL` = `libsql://SEU-BANCO.turso.io`
   - `TURSO_AUTH_TOKEN` = o token gerado no passo 1
   - `JWT_SECRET` = um valor aleatório longo (gere um novo, diferente do de dev)
4. Deploy. A Vercel detecta o Next.js automaticamente (build command
   `next build`, output gerenciado pelo framework).

Depois disso, o app estará acessível pela URL da Vercel, com os 2 usuários
podendo logar de qualquer lugar.

> **Nota:** em testes locais, a biblioteca do adapter libSQL (usada só para
> falar com o Turso) apresentou um bug nos filtros de intervalo de data
> (`gte`/`lt`). O app já usa o driver clássico do Prisma (sem esse bug) para
> SQLite local, e só troca para o adapter libSQL quando `DATABASE_URL` aponta
> para `libsql://`. Depois de configurar o Turso, vale conferir se os
> filtros de período em Lançamentos e o Dashboard mostram os valores
> corretos; se o mesmo problema aparecer lá, a alternativa mais simples é
> usar Postgres (ex: Supabase) no lugar do Turso.

### Alternativa mais simples (sem Turso)

Se preferir não lidar com um banco externo, dá para hospedar em um serviço
com disco persistente (ex: [Railway](https://railway.app) ou
[Render](https://render.com)) e manter o SQLite em arquivo local — nesse
caso `DATABASE_URL="file:./dev.db"` funciona sem nenhuma mudança de código,
bastando rodar `npx prisma migrate deploy && npm run db:seed` uma vez no
servidor.

## Segurança

- Todas as rotas (páginas e API) exigem sessão válida, exceto `/login` — ver
  [src/proxy.ts](src/proxy.ts).
- Sessão fica em cookie `httpOnly`, `secure` em produção, assinado com
  `JWT_SECRET`.
- Não existe endpoint de cadastro público; os 2 usuários são criados apenas
  via `prisma/seed.ts`.
