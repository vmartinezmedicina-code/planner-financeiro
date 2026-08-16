import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { getDashboardData } from "@/lib/dashboard";

// Monta um resumo textual da situação financeira atual para dar contexto à IA.
export async function buildFinancialContext(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dashboard, banks, cards, investments] = await Promise.all([
    getDashboardData(year, month),
    prisma.bank.findMany(),
    prisma.creditCard.findMany(),
    prisma.investment.findMany(),
  ]);

  const bankLines = await Promise.all(
    banks.map(async (b) => {
      const agg = await prisma.transaction.aggregate({ where: { bankId: b.id }, _sum: { amount: true } });
      const balance = b.initialBalance + (agg._sum.amount ?? 0);
      return `- ${b.name}: saldo atual ${formatCurrency(balance)}`;
    })
  );

  const cardLines = await Promise.all(
    cards.map(async (c) => {
      const txs = await prisma.transaction.findMany({ where: { creditCardId: c.id } });
      const total = txs.reduce((acc, t) => acc + Math.abs(t.amount), 0);
      return `- ${c.name}: fatura atual ${formatCurrency(total)}${c.limit ? ` (limite ${formatCurrency(c.limit)})` : ""}`;
    })
  );

  const totalInvested = investments.reduce((acc, i) => acc + i.contributedAmount, 0);
  const totalInvestedCurrent = investments.reduce((acc, i) => acc + i.currentValue, 0);

  const comparisonLines = dashboard.comparison
    .filter((c) => c.depth === 0)
    .map((c) => `- ${c.name}: planejado ${formatCurrency(c.planned)}, realizado ${formatCurrency(c.realized)}`);

  return `Resumo financeiro do usuário (mês atual, ${month}/${year}):

Saldo do período (realizado): ${formatCurrency(dashboard.summary.realizedBalance)}
Receitas realizadas: ${formatCurrency(dashboard.summary.totalReceitaRealized)} (planejado: ${formatCurrency(dashboard.summary.totalReceitaPlanned)})
Despesas realizadas: ${formatCurrency(dashboard.summary.totalDespesaRealized)} (planejado: ${formatCurrency(dashboard.summary.totalDespesaPlanned)})

Planejado vs. realizado por categoria:
${comparisonLines.join("\n") || "(sem categorias com movimentação)"}

Bancos:
${bankLines.join("\n") || "(nenhum banco cadastrado)"}

Cartões de crédito:
${cardLines.join("\n") || "(nenhum cartão cadastrado)"}

Investimentos:
Total aportado: ${formatCurrency(totalInvested)}
Valor atual da carteira: ${formatCurrency(totalInvestedCurrent)}
`;
}
