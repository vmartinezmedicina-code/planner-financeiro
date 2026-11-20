"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Plus, Target } from "lucide-react";
import { formatCents } from "@/lib/money";
import type { GoalView, GoalsSummary } from "@/lib/goals/goalService";
import { GoalCard } from "./GoalCard";
import { GoalWizard } from "./GoalWizard";
import { GoalSimulation } from "./GoalSimulation";
import { GoalContributionForm } from "./GoalContributionForm";
import { shareTone } from "./goalLabels";

type Option = { id: string; name: string; color?: string; balanceCents?: number };
type Data = { goals: GoalView[]; summary: GoalsSummary };

const BASIS_TEXT: Record<GoalsSummary["freeFlow"]["basis"], string> = {
  PLANNED: "receita − despesa planejadas do mês",
  HISTORY: "média dos últimos 3 meses (sem planejamento neste mês)",
  NONE: "",
};

export function GoalsBoard({ initial, banks, investments }: { initial: Data; banks: Option[]; investments: Option[] }) {
  const [data, setData] = useState(initial);
  const [synced, setSynced] = useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setData(initial);
  }
  const [editing, setEditing] = useState<GoalView | "new" | null>(null);
  const [simulating, setSimulating] = useState<GoalView | null>(null);
  const [contributing, setContributing] = useState<GoalView | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/goals");
    if (res.ok) setData(await res.json());
  }

  async function patchGoal(id: string, body: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/goals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar.");
    await reload();
  }

  async function deleteGoal(goal: GoalView) {
    if (!confirm(`Excluir a meta "${goal.name}"? Os aportes registrados nela também serão apagados. Os saldos das contas não mudam.`)) return;
    await fetch(`/api/goals/${goal.id}`, { method: "DELETE" });
    reload();
  }

  async function deleteContribution(goal: GoalView, cid: string) {
    if (!confirm("Excluir este aporte?")) return;
    await fetch(`/api/goals/${goal.id}/contributions/${cid}`, { method: "DELETE" });
    reload();
  }

  const { summary } = data;
  const active = data.goals.filter((g) => g.status === "ACTIVE" || g.status === "PAUSED");
  const finished = data.goals.filter((g) => g.status === "ACHIEVED" || g.status === "CANCELLED");
  const tone = shareTone(summary.monthlyNeededSharePct);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">Metas</h1>
        <button type="button" onClick={() => setEditing("new")} className="flex items-center gap-1.5 rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
          <Plus className="h-3.5 w-3.5" /> Nova meta
        </button>
      </div>

      {data.goals.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Guardado nas metas ativas</span>
            <span className="text-xl font-semibold tabular-nums">{formatCents(summary.reservedCents)}</span>
            <span className="text-xs text-muted">
              de {formatCents(summary.targetCents)} · {summary.activeCount} meta{summary.activeCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Para cumprir os prazos</span>
            <span className="text-xl font-semibold tabular-nums">{formatCents(summary.monthlyNeededCents)}/mês</span>
            {summary.freeFlow.basis === "NONE" ? (
              <span className="text-xs text-muted">
                Preencha o <Link href="/planejamento" className="text-accent underline-offset-2 hover:underline">Planejamento</Link> para ver o impacto no fluxo do mês.
              </span>
            ) : summary.freeFlow.cents <= 0 ? (
              <span className="text-xs text-negative">
                O fluxo mensal livre está em {formatCents(summary.freeFlow.cents)} ({BASIS_TEXT[summary.freeFlow.basis]}).
              </span>
            ) : (
              <span className={clsx("text-xs", tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning-fg" : "text-muted")}>
                {summary.monthlyNeededSharePct !== null ? `${summary.monthlyNeededSharePct.toLocaleString("pt-BR")}% de ` : ""}
                {formatCents(summary.freeFlow.cents)} livres por mês ({BASIS_TEXT[summary.freeFlow.basis]})
              </span>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-negative bg-negative-bg rounded-lg px-3 py-2">{error}</p>}

      {data.goals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-surface p-8 flex flex-col items-center gap-3 text-center">
          <Target className="h-8 w-8 text-accent" />
          <p className="text-sm font-medium text-foreground">Nenhuma meta ainda</p>
          <p className="text-xs text-muted max-w-sm">
            Crie uma meta (viagem, reserva de emergência, uma compra) e o sistema calcula quanto guardar por mês e o impacto no orçamento da família.
          </p>
          <button type="button" onClick={() => setEditing("new")} className="rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-2">
            Criar a primeira meta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {active.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              onContribute={() => setContributing(g)}
              onSimulate={() => setSimulating(g)}
              onEdit={() => setEditing(g)}
              onToggleStatus={(status) => patchGoal(g.id, { status })}
              onDelete={() => deleteGoal(g)}
              onDeleteContribution={(cid) => deleteContribution(g, cid)}
            />
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wide">Concluídas</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {finished.map((g) => (
              <GoalCard
                key={g.id}
                goal={g}
                onContribute={() => setContributing(g)}
                onSimulate={() => setSimulating(g)}
                onEdit={() => setEditing(g)}
                onToggleStatus={(status) => patchGoal(g.id, { status })}
                onDelete={() => deleteGoal(g)}
                onDeleteContribution={(cid) => deleteContribution(g, cid)}
              />
            ))}
          </div>
        </div>
      )}

      {editing && (
        <GoalWizard
          goal={editing === "new" ? null : editing}
          banks={banks}
          investments={investments}
          freeFlowCents={summary.freeFlow.cents}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
      {simulating && (
        <GoalSimulation
          goal={simulating}
          freeFlowCents={summary.freeFlow.cents}
          onClose={() => setSimulating(null)}
          onApplyPlan={async (monthly) => {
            await patchGoal(simulating.id, { monthlyPlan: monthly });
            setSimulating(null);
          }}
        />
      )}
      {contributing && (
        <GoalContributionForm
          goal={contributing}
          onClose={() => setContributing(null)}
          onSaved={() => {
            setContributing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
