import { prisma } from "@/lib/prisma";
import { formatDate, todayAsUtcDate } from "@/lib/format";
import { formatCents } from "@/lib/money";
import { getDashboardData } from "@/lib/dashboard";
import { getCategoryAnalysis } from "@/lib/analytics/categoryAnalytics";

// Monta um resumo textual da situação financeira atual para dar contexto à IA.
// Todos os números já vêm calculados pelo backend; a IA só interpreta.
export async function buildFinancialContext(householdId: string): Promise<string> {
  const today = todayAsUtcDate();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  const [d, despesas, receitas, cards, investments] = await Promise.all([
    getDashboardData(householdId, year, month),
    getCategoryAnalysis(householdId, { type: "DESPESA", categoryId: null, year, month }),
    getCategoryAnalysis(householdId, { type: "RECEITA", categoryId: null, year, month }),
    prisma.creditCard.findMany({ where: { householdId }, select: { name: true, limit: true } }),
    prisma.investment.findMany({ where: { householdId }, select: { contributedAmountCents: true, currentValueCents: true } }),
  ]);

  const accountLines = d.balance.accounts.map(
    (a) => `- ${a.name}: saldo hoje ${formatCents(a.balanceCents)}${a.scheduledCents ? ` (lançamentos futuros: ${formatCents(a.scheduledCents)})` : ""}`
  );

  const limitByCard = new Map(cards.map((c) => [c.name, c.limit]));
  const cardLines = d.cards.items.map((c) => {
    const limit = limitByCard.get(c.name);
    const next = c.next ? ` — próxima fatura ${c.next.label}, ${formatCents(c.next.remainingCents)}, vence ${formatDate(c.next.dueDate)}` : "";
    return `- ${c.name}: em aberto ${formatCents(c.openCents)}${next}${limit ? ` (limite R$ ${limit.toFixed(2)})` : ""}`;
  });

  const catLine = (c: { name: string; realizedCents: number; plannedCents: number; previousCents: number }) =>
    `- ${c.name}: realizado ${formatCents(c.realizedCents)}, planejado ${formatCents(c.plannedCents)}, mês anterior ${formatCents(c.previousCents)}`;

  const upcomingLines = d.upcoming.items
    .slice(0, 15)
    .map((i) => `- ${formatDate(i.date)}: ${i.label} ${formatCents(i.amountCents)}${i.overdue ? " (vencido)" : ""}${i.provisional ? " (fatura ainda aberta)" : ""}`);

  const totalInvested = investments.reduce((acc, i) => acc + i.contributedAmountCents, 0);
  const totalInvestedCurrent = investments.reduce((acc, i) => acc + i.currentValueCents, 0);
  const p = d.period;

  return `Resumo financeiro da família em ${formatDate(today)} (mês ${month}/${year}). Valores calculados pelo sistema; não recalcule.

Mês atual (competência):
- Receitas: ${formatCents(p.receitaRealizedCents)} realizadas de ${formatCents(p.receitaPlannedCents)} planejadas
- Despesas: ${formatCents(p.despesaRealizedCents)} realizadas de ${formatCents(p.despesaPlannedCents)} planejadas${p.despesaChangePct !== null ? ` (${p.despesaChangePct > 0 ? "+" : ""}${p.despesaChangePct}% vs. mês anterior)` : ""}
- Saldo do mês: ${formatCents(p.balanceCents)}
- Orçamento utilizado: ${p.budgetUsedPct !== null ? p.budgetUsedPct + "%" : "sem orçamento definido"}

Dinheiro hoje:
- Saldo real em contas: ${formatCents(d.balance.totalCents)}
- Faturas de cartão em aberto: ${formatCents(d.cards.openCents)}
- Saldo projetado em ${d.projection.days} dias: ${formatCents(d.projection.projectedCents)} (entradas ${formatCents(d.projection.inflowCents)}, saídas ${formatCents(d.projection.outflowCents)})${d.projection.lowestCents < 0 && d.projection.lowestDate ? ` — pode ficar negativo em ${formatDate(d.projection.lowestDate)}` : ""}

Despesas do mês por grande categoria:
${despesas?.children.map(catLine).join("\n") || "(sem despesas no mês)"}

Receitas do mês por origem:
${receitas?.children.map(catLine).join("\n") || "(sem receitas no mês)"}

Contas:
${accountLines.join("\n") || "(nenhuma conta cadastrada)"}

Cartões de crédito:
${cardLines.join("\n") || "(nenhum cartão cadastrado)"}

Próximos ${d.upcoming.days} dias (já lançado):
${upcomingLines.join("\n") || "(nada a vencer)"}

Investimentos:
- Total aportado: ${formatCents(totalInvested)}
- Valor atual da carteira: ${formatCents(totalInvestedCurrent)}

Observações: transferências entre contas e pagamentos de fatura não contam como receita nem despesa. Compras no cartão contam como despesa na data da compra.
`;
}
