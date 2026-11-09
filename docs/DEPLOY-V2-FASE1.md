# Colocar a Fase 1 da V2 em produção

A Fase 1 muda o banco (só acrescenta tabelas e colunas; nada é apagado). A ordem
importa: **banco primeiro, código depois**. Se o código subir antes, o site fica
com erro até a migration rodar.

## Antes de começar
- Gere um token novo no Turso (o antigo apareceu em um print) e atualize
  `TURSO_AUTH_TOKEN` nas variáveis da Vercel.
- Opcional, recomendado: no painel do Turso, crie um *branch*/cópia do banco como backup.

## Passo a passo (PowerShell, na pasta do projeto)

```powershell
cd "C:\Users\vmart\OneDrive\Desktop\planner-financeiro"
```

```powershell
$env:DATABASE_URL="libsql://planner-financeiro-vmartinezmedicina-code.aws-us-east-1.turso.io"
```

```powershell
$env:TURSO_AUTH_TOKEN="COLE_O_TOKEN_NOVO_AQUI"
```

1. Aplicar as migrations (estrutura + backfill em SQL):

```powershell
npm run db:deploy-turso
```

Esperado: `20260820020000_v2_foundation` e `20260820020100_v2_backfill` aplicadas; as anteriores puladas.

2. Criar as faturas das compras de cartão que já existem:

```powershell
npm run db:backfill-v2
```

Esperado: "Backfill concluído: N compra(s) ligadas; M fatura(s) com total recalculado."
Pode ser executado de novo sem problema.

3. Publicar o código:

```powershell
git push origin main
```

4. Fechar o terminal (as variáveis `$env:` somem) e conferir o deploy na Vercel.

## Depois do deploy
- **Cartões:** confira o *dia de fechamento* de cada cartão. Sem ele, cada fatura fecha no
  último dia do mês. Ao salvar o dia, as compras de faturas ainda não pagas são redistribuídas.
- **Faturas antigas:** compras antigas de cartão viram faturas "vencidas" em aberto. Para as
  que já foram pagas na vida real, use **Pagar** em cada fatura (escolha a conta e a data real).
  Atenção: isso debita o saldo da conta. Se o saldo inicial da conta já considerava esses
  pagamentos, ajuste o saldo inicial em **Bancos** depois.
- **Lançamentos antigos de "pagamento de fatura"** feitos como despesa comum (categoria
  "Cartão de Crédito > Fatura") contam em dobro com as compras. Exclua-os e registre o
  pagamento pela fatura.
- **Sessões:** quem estava logado continua logado. Ao trocar a senha, os outros aparelhos
  são desconectados em até 1 minuto.

## Como voltar atrás
O código anterior funciona sobre o banco novo (ignora as colunas extras). Na Vercel,
em Deployments, use "Promote"/"Redeploy" no deploy anterior. Não é preciso desfazer o banco.
