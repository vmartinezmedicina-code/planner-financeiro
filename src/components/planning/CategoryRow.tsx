"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, ArrowUp, ArrowDown, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { CategoryNode } from "@/lib/planning";

type Props = {
  node: CategoryNode;
  depth: number;
  activeTab: "planejado" | "realizado";
  isFirst: boolean;
  isLast: boolean;
  onEditAmount: (categoryId: string, amount: number) => void;
  onAddChild: (parentId: string, type: CategoryNode["type"], name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
};

export function CategoryRow({
  node,
  depth,
  activeTab,
  isFirst,
  isLast,
  onEditAmount,
  onAddChild,
  onRename,
  onDelete,
  onMove,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const hasChildren = node.children.length > 0;
  const isHeader = depth === 0;

  const displayValue = activeTab === "planejado" ? node.planned : node.realizedTotal;
  const totalValue = activeTab === "planejado" ? node.plannedTotal : node.realizedTotal;
  const wasAdjusted = node.planned !== 0;

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draftName.trim()) return;
    onAddChild(node.id, node.type, draftName.trim());
    setDraftName("");
    setAdding(false);
    setExpanded(true);
  }

  function submitRename(e: React.FormEvent) {
    e.preventDefault();
    if (!draftName.trim()) return;
    onRename(node.id, draftName.trim());
    setRenaming(false);
  }

  return (
    <div>
      <div
        className={clsx(
          "group flex items-center gap-2 px-2 py-2 rounded-lg",
          isHeader && "bg-surface-muted font-semibold mt-2"
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={clsx("h-5 w-5 flex items-center justify-center shrink-0", !hasChildren && "invisible")}
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>

        {renaming ? (
          <form onSubmit={submitRename} className="flex-1 flex items-center gap-1">
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={submitRename}
              className="flex-1 min-w-0 rounded-md border border-accent bg-surface px-2 py-1 text-sm outline-none"
            />
          </form>
        ) : (
          <span className="flex-1 min-w-0 truncate text-sm text-foreground">{node.name}</span>
        )}

        <div className="hidden sm:flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
          <button
            type="button"
            onClick={() => onMove(node.id, -1)}
            disabled={isFirst}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-background disabled:opacity-30"
            aria-label="Mover para cima"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(node.id, 1)}
            disabled={isLast}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-background disabled:opacity-30"
            aria-label="Mover para baixo"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setDraftName(node.name);
              setRenaming(true);
            }}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-background"
            aria-label="Renomear"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-background"
            aria-label="Adicionar subcategoria"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (confirm(`Excluir "${node.name}"? Isso também remove as subcategorias.`)) onDelete(node.id);
            }}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-negative-bg text-negative"
            aria-label="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="w-32 sm:w-36 shrink-0 text-right">
          {activeTab === "planejado" ? (
            <div className="flex items-center justify-end gap-1">
              {wasAdjusted && <TrendingUp className="h-3 w-3 text-accent shrink-0" aria-label="Valor ajustado" />}
              <input
                type="number"
                step="0.01"
                defaultValue={node.planned === 0 ? "" : node.planned}
                placeholder="0,00"
                onBlur={(e) => onEditAmount(node.id, Number(e.target.value) || 0)}
                className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-right text-foreground outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          ) : (
            <span className={clsx("text-sm font-medium", isHeader && "font-semibold")}>
              {formatCurrency(totalValue)}
            </span>
          )}
        </div>
      </div>

      {isHeader && activeTab === "planejado" && (
        <div className="flex justify-end px-2" style={{ paddingRight: "0px" }}>
          <span className="text-xs text-muted mr-1">Total planejado: {formatCurrency(node.plannedTotal)}</span>
        </div>
      )}

      {adding && (
        <form
          onSubmit={submitAdd}
          className="flex items-center gap-2 py-1"
          style={{ paddingLeft: `${(depth + 1) * 20 + 32}px` }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Nome da subcategoria"
            className="flex-1 max-w-xs rounded-md border border-accent bg-surface px-2 py-1 text-sm outline-none"
          />
          <button type="submit" className="text-xs font-medium text-accent">
            Adicionar
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-xs text-muted">
            Cancelar
          </button>
        </form>
      )}

      {expanded &&
        node.children.map((child, i) => (
          <CategoryRow
            key={child.id}
            node={child}
            depth={depth + 1}
            activeTab={activeTab}
            isFirst={i === 0}
            isLast={i === node.children.length - 1}
            onEditAmount={onEditAmount}
            onAddChild={onAddChild}
            onRename={onRename}
            onDelete={onDelete}
            onMove={onMove}
          />
        ))}
    </div>
  );
}
