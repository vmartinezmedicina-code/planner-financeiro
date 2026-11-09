import Link from "next/link";
import { clsx } from "clsx";
import { formatDate, shortMonthLabel } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { DashboardData } from "@/lib/dashboard";
import { InvoiceStatusBadge } from "@/components/creditcards/InvoiceList";

/** Detalhe do "Saldo disponível": saldo real de cada conta e o que está agendado. */
export function BalanceDetail({ balance }: { balance: DashboardData["balance"] }) {
  if (balance.accounts.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Nenhuma conta cadastrada ainda. Cadastre suas contas com o saldo de hoje para acompanhar o dinheiro disponível.</p>
        <Link href="/bancos" className="self-start rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          Cadastrar contas
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-border">
        {balance.accounts.map((a) => (
          <div key={a.id} className="py-2.5 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
              <span className="min-w-0">
                <span className="block text-sm text-foreground truncate">{a.name}</span>
                {a.scheduledCents !== 0 && (
                  <span className="block text-[11px] text-muted">
                    agendado {formatCents(a.scheduledCents)} · previsto {formatCents(a.balanceCents + a.scheduledCents)}
                  </span>
                )}
              </span>
            </span>
            <span className={clsx("text-sm font-semibold tabular-nums whitespace-nowrap", a.balanceCents < 0 && "text-negative")}>
              {formatCents(a.balanceCents)}
            </span>
          </div>
        ))}
        <div className="py-2.5 flex items-center justify-between text-sm font-semibold">
          <span>Total</span>
          <span className={clsx("tabular-nums", balance.totalCents < 0 && "text-negative")}>{formatCents(balance.totalCents)}</span>
        </div>
      </div>

      <p className="text-[11px] text-muted">
        O saldo considera os lançamentos com data até hoje. Lançamentos com data futura aparecem como agendados e só entram no saldo no dia.
      </p>

      <Link href="/bancos" className="text-xs font-medium text-accent">
        Gerenciar contas e transferências
      </Link>
    </div>
  );
}

/** Detalhe de "Cartões": em aberto por cartão, próxima fatura e parcelas futuras. */
export function CardsDetail({ cards }: { cards: DashboardData["cards"] }) {
  const installments = cards.installments.filter((i) => i.cents > 0);

  if (cards.items.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted">Nenhum cartão cadastrado ainda.</p>
        <Link href="/cartoes" className="self-start rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          Cadastrar cartão
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col divide-y divide-border">
        {cards.items.map((c) => (
          <div key={c.id} className="py-2.5 flex items-start justify-between gap-3">
            <span className="flex items-start gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: c.color }} />
              <span className="min-w-0">
                <span className="block text-sm text-foreground truncate">{c.name}</span>
                {c.next ? (
                  <span className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted">
                    fatura {c.next.label} · vence {formatDate(c.next.dueDate)}
                    <InvoiceStatusBadge status={c.next.status} />
                  </span>
                ) : (
                  <span className="block text-[11px] text-muted">nada em aberto</span>
                )}
              </span>
            </span>
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap">{formatCents(c.openCents)}</span>
          </div>
        ))}
        <div className="py-2.5 flex items-center justify-between text-sm font-semibold">
          <span>Total em aberto</span>
          <span className="tabular-nums">{formatCents(cards.openCents)}</span>
        </div>
      </div>

      {installments.length > 0 && (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">Parcelas nos próximos meses</h3>
          <div className="flex flex-col divide-y divide-border">
            {installments.map((i) => (
              <div key={`${i.year}-${i.month}`} className="py-2 flex items-center justify-between text-sm">
                <span className="text-muted">{shortMonthLabel(i.year, i.month)}</span>
                <span className="tabular-nums">{formatCents(i.cents)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link href="/cartoes" className="text-xs font-medium text-accent">
        Ver faturas e pagar
      </Link>
    </div>
  );
}
