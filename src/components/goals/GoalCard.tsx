"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, Link2, Pencil, Trash2 } from "lucide-react";
import { formatDayMonth } from "@/lib/format";
import { formatCents } from "@/lib/money";
import type { GoalView } from "@/lib/goals/goalService";
import { CONTRIBUTION_SOURCE_LABEL, GOAL_TYPE_LABEL, PRIORITY_LABEL, STRATEGY_LABEL, monthYearLabel, shareTone } from "./goalLabels";
import { GoalTypeIcon } from "./GoalTypeIcon";

const PRIORITY_CLASS: Record<string, string> = {
  HIGH: "bg-negative-bg text-negative",
  MEDIUM: "bg-warning-bg text-warning-fg",
  LOW: "bg-surface-muted text-muted",
};

export function GoalCard({
  goal,
  onContribute,
  onSimulate,
  onEdit,
  onToggleStatus,
  onDelete,
  onDeleteContribution,
}: {
  goal: GoalView;
  onContribute: () => void;
  onSimulate: () => void;
  onEdit: () => void;
  onToggleStatus: (status: "ACTIVE" | "PAUSED" | "ACHIEVED") => void;
  onDelete: () => void;
  onDeleteContribution: (contributionId: string) => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const p = goal.progress;
  const paused = goal.status === "PAUSED";
  const done = p.achieved || goal.status === "ACHIEVED";
  const tone = shareTone(goal.freeFlowSharePct);
  const fill = Math.min(100, Math.max(0, p.percent));

  return (
    <div className={clsx("rounded-2xl border border-border bg-surface p-4 flex flex-col gap-3", paused && "opacity-70")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center shrink-0">
            <GoalTypeIcon type={goal.type} className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{goal.name}</p>
            <p className="text-[11px] text-muted truncate">
              {GOAL_TYPE_LABEL[goal.type]} · {STRATEGY_LABEL[goal.strategy]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {done ? (
            <span className="text-[11px] rounded-full px-2 py-0.5 bg-positive-bg text-positive">Atingida</span>
          ) : paused ? (
            <span className="text-[11px] rounded-full px-2 py-0.5 bg-surface-muted text-muted">Pausada</span>
          ) : p.overdue ? (
            <span className="text-[11px] rounded-full px-2 py-0.5 bg-negative-bg text-negative">Prazo vencido</span>
          ) : (
            <span className={clsx("text-[11px] rounded-full px-2 py-0.5", PRIORITY_CLASS[goal.priority])}>Prioridade {PRIORITY_LABEL[goal.priority].toLowerCase()}</span>
          )}
          <button type="button" onClick={onEdit} className="h-7 w-7 flex items-center justify-center rounded hover:bg-surface-muted" aria-label={`Editar ${goal.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDelete} className="h-7 w-7 flex items-center justify-center rounded hover:bg-negative-bg text-negative" aria-label={`Excluir ${goal.name}`}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">{formatCents(goal.currentCents)}</span>
          <span className="text-xs text-muted tabular-nums">de {formatCents(goal.targetCents)}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-valuenow={Math.round(p.percent)} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso da meta">
          <div className={clsx("h-full rounded-full", done ? "bg-positive" : "bg-accent")} style={{ width: `${fill}%` }} />
        </div>
        <p className="text-xs text-muted">
          {p.percent.toLocaleString("pt-BR")}% · {done ? "meta atingida" : `faltam ${formatCents(p.remainingCents)}`}
        </p>
      </div>

      {!done && (
        <div className="flex flex-col gap-1 text-xs">
          {goal.targetDate ? (
            p.monthsLeft !== null && p.monthsLeft > 0 && p.monthlyNeededCents !== null ? (
              <p>
                Até <strong>{monthYearLabel(goal.targetDate)}</strong> ({p.monthsLeft} {p.monthsLeft === 1 ? "mês" : "meses"}): guardar{" "}
                <strong>{formatCents(p.monthlyNeededCents)}/mês</strong>
                {p.weeklyNeededCents ? <span className="text-muted"> (≈ {formatCents(p.weeklyNeededCents)}/semana)</span> : null}
              </p>
            ) : (
              <p className="text-negative">O prazo ({monthYearLabel(goal.targetDate)}) passou. Edite a meta para definir uma nova data.</p>
            )
          ) : (
            <p className="text-muted">Sem data definida: use Simular para ver prazos e aportes.</p>
          )}
          {p.plan && p.plan.months !== null && (
            <p className={clsx(p.plan.onTrack === false ? "text-warning-fg" : "text-muted")}>
              Com o aporte planejado de {formatCents(goal.monthlyPlanCents!)}/mês, chega em {monthYearLabel(p.plan.reachDate!)}
              {p.plan.onTrack === false ? " (depois do prazo)" : p.plan.onTrack ? " (dentro do prazo)" : ""}.
            </p>
          )}
          {goal.freeFlowSharePct !== null && (
            <p className={clsx(tone === "negative" ? "text-negative" : tone === "warning" ? "text-warning-fg" : "text-muted")}>
              Consome {goal.freeFlowSharePct.toLocaleString("pt-BR")}% do fluxo mensal livre.
            </p>
          )}
        </div>
      )}

      {goal.currentSource !== "CONTRIBUTIONS" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted">
          <Link2 className="h-3.5 w-3.5" /> Acompanha {goal.currentSource === "BANK" ? "o saldo da conta" : "o valor do investimento"} {goal.linkedName}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {goal.currentSource === "CONTRIBUTIONS" && !done && !paused && (
          <button type="button" onClick={onContribute} className="rounded-lg bg-accent text-accent-foreground text-xs font-medium px-3 py-1.5">
            Aportar
          </button>
        )}
        <button type="button" onClick={onSimulate} className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 hover:bg-surface-muted">
          Simular
        </button>
        {!done && (
          <button
            type="button"
            onClick={() => onToggleStatus(paused ? "ACTIVE" : "PAUSED")}
            className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 hover:bg-surface-muted"
          >
            {paused ? "Retomar" : "Pausar"}
          </button>
        )}
        {done && goal.status !== "ACHIEVED" && (
          <button type="button" onClick={() => onToggleStatus("ACHIEVED")} className="rounded-lg border border-border text-xs font-medium px-3 py-1.5 hover:bg-surface-muted">
            Marcar como concluída
          </button>
        )}
      </div>

      {goal.currentSource === "CONTRIBUTIONS" && goal.contributions.length > 0 && (
        <div>
          <button type="button" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen} className="flex items-center gap-1 text-xs font-medium text-accent">
            <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", !historyOpen && "-rotate-90")} />
            Aportes ({goal.contributions.length})
          </button>
          {historyOpen && (
            <div className="mt-2 flex flex-col divide-y divide-border">
              {goal.initialCents > 0 && (
                <div className="py-1.5 flex items-center justify-between text-xs text-muted">
                  <span>Já reservado na criação</span>
                  <span className="tabular-nums">{formatCents(goal.initialCents)}</span>
                </div>
              )}
              {goal.contributions.map((c) => (
                <div key={c.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate">
                    <span className="text-muted tabular-nums">{formatDayMonth(c.date)}</span> · {c.amountCents < 0 ? "Retirada" : CONTRIBUTION_SOURCE_LABEL[c.source]}
                    {c.note ? <span className="text-muted"> · {c.note}</span> : null}
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span className={clsx("tabular-nums font-medium", c.amountCents < 0 && "text-negative")}>{formatCents(c.amountCents)}</span>
                    <button
                      type="button"
                      onClick={() => onDeleteContribution(c.id)}
                      className="h-6 w-6 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
                      aria-label="Excluir aporte"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
