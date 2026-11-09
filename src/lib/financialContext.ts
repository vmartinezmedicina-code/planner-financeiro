import { prisma } from "@/lib/prisma";
import { formatCurrency } from "@/lib/format";
import { fromCents } from "@/lib/money";
import { getDashboardData } from "@/lib/dashboard";

// Monta um resumo textual da situação financeira atual para dar contexto à IA.
// Todos os números já vêm calculados pelo backend; a IA só interpreta.
export async function buildFinancialContext(householdId: string): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [dashboard, cards, investments] = await Promise.all([
    getDashboardData(householdId, year, month),
    prisma.creditCard.findMany({ where: { householdId }, select: { name: true, limit: true } }),
    prisma.investment.findMany({ where: { householdId }, select: { contributedAmountCents: true, currentValueCents: true } }),
  ]);

  const bankLines = dashboard.bankBalances.map((b) => `- ${b.label}: saldo atual ${formatCurrency(b.total)}`);

  const limitByCard = new Map(cards.map((c) => [c.name, c.limit]));
  const cardLines = dashboard.cardInvoices.map((c) => {
    const limit = limitByCard.get(c.label);
    const next = c.nextLabel ? ` (próxima fatura ${c.nextLabel}, vence ${c.nextDue?.slice(0, 10)})` : "";
    return `- ${c.label}: em aberto ${formatCurrency(c.open)}${next}${limit ? ` (limite ${formatCurrency(limit)})` : ""}`;
  });

  const totalInvested = fromCents(investments.reduce((acc, i) => acc + i.contributedAmountCents, 0));
  const totalInvestedCurrent = fromCents(investments.reduce((acc, i) => acc + i.currentValueCents, 0));

  const comparisonLines = dashboard.comparison
    .filter((c) => c.depth === 0)
    .map((c) => `- ${c.name}: planejado ${formatCurrency(c.planned)}, realizado ${formatCurrency(c.realized)}`);

  const topLines = dashboard.despesaBreakdown.slice(0, 8).map((c) => `- ${c.name}: ${formatCurrency(c.value)}`);

  return `Resumo financeiro da família (mês atual, ${month}/${year}):

Saldo do período (realizado): ${formatCurrency(dashboard.summary.realizedBalance)}
Receitas realizadas: ${formatCurrency(dashboard.summary.totalReceitaRealized)} (planejado: ${formatCurrency(dashboard.summary.totalReceitaPlanned)})
Despesas realizadas: ${formatCurrency(dashboard.summary.totalDespesaRealized)} (planejado: ${formatCurrency(dashboard.summary.totalDespesaPlanned)})
Saldo total em contas: ${formatCurrency(dashboard.totalBankBalance)}
Faturas de cartão em aberto: ${formatCurrency(dashboard.totalOpenInvoices)}

Planejado vs. realizado por grupo:
${comparisonLines.join("\n") || "(sem categorias com movimentação)"}

Maiores despesas do mês por setor:
${topLines.join("\n") || "(sem despesas no mês)"}

Contas:
${bankLines.join("\n") || "(nenhuma conta cadastrada)"}

Cartões de crédito:
${cardLines.join("\n") || "(nenhum cartão cadastrado)"}

Investimentos:
Total aportado: ${formatCurrency(totalInvested)}
Valor atual da carteira: ${formatCurrency(totalInvestedCurrent)}

Observação: transferências entre contas e pagamentos de fatura não contam como receita nem despesa.
`;
}
