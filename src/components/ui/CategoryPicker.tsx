"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CategoryOption } from "@/lib/categories";

type Node = CategoryOption & { children: Node[] };

/**
 * Escolha de categoria por toques: primeiro as grandes categorias
 * (Moradia, Alimentação...), depois as subcategorias, em quantos níveis a
 * árvore tiver. Tem busca para listas longas. Mostra só o tipo pedido
 * (despesa ou receita).
 */
export function CategoryPicker({
  categories,
  type,
  value,
  onChange,
  label = "Categoria",
}: {
  categories: CategoryOption[];
  type: "RECEITA" | "DESPESA";
  value: string;
  onChange: (categoryId: string) => void;
  label?: string;
}) {
  const { byId, topLevel } = useMemo(() => {
    const own = categories.filter((c) => c.type === type);
    const map = new Map<string, Node>(own.map((c) => [c.id, { ...c, children: [] }]));
    const roots: Node[] = [];
    for (const n of map.values()) {
      const parent = n.parentId ? map.get(n.parentId) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    const sort = (list: Node[]) => {
      list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
      list.forEach((n) => sort(n.children));
    };
    sort(roots);
    // Um grupo raiz com filhos (ex.: "Despesas Mensais") é só um agrupador:
    // o primeiro nível mostra direto as categorias de dentro dele.
    const top = roots.flatMap((r) => (r.children.length ? r.children : [r]));
    return { byId: map, topLevel: top };
  }, [categories, type]);

  const selected = value ? byId.get(value) : undefined;
  const [browsing, setBrowsing] = useState(!selected);
  const [parentId, setParentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const parent = parentId ? byId.get(parentId) : undefined;
  const isTop = !parent;
  const shown = parent ? parent.children : topLevel;

  function isGroupingRootId(id: string) {
    const n = byId.get(id);
    return !!n && !n.parentId && n.children.length > 0;
  }
  /** Nível a abrir para mostrar os "irmãos" de uma categoria (null = nível inicial). */
  function levelOf(n: Node | undefined): string | null {
    return n?.parentId && !isGroupingRootId(n.parentId) ? n.parentId : null;
  }

  // Caminho legível sem o agrupador raiz: "Alimentação › Mercado".
  const pathOf = (n: Node | undefined): string => {
    const parts: string[] = [];
    let cur = n;
    while (cur) {
      const isGroupingRoot = !cur.parentId && cur.children.length > 0;
      if (!isGroupingRoot || cur === n) parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return parts.join(" › ");
  };

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (q.length < 2) return [];
    return [...byId.values()].filter((n) => normalize(n.name).includes(q)).slice(0, 30);
  }, [query, byId]);

  function choose(id: string) {
    onChange(id);
    setQuery("");
    setBrowsing(false);
  }

  function open(n: Node) {
    if (n.children.length) {
      setParentId(n.id);
      setQuery("");
    } else {
      choose(n.id);
    }
  }

  if (!browsing) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "flex-1 min-w-0 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium min-h-[40px]",
              selected ? "bg-accent/10 border-accent text-foreground" : "border-border text-muted"
            )}
          >
            {selected && <Check className="h-3.5 w-3.5 shrink-0 text-accent" />}
            <span className="truncate">{selected ? pathOf(selected) : "Sem categoria"}</span>
          </span>
          <button
            type="button"
            onClick={() => {
              setParentId(levelOf(selected));
              setBrowsing(true);
            }}
            className="rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-surface-muted min-h-[40px]"
          >
            Trocar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {selected && (
          <button type="button" onClick={() => setBrowsing(false)} className="text-[11px] font-medium text-accent">
            Cancelar
          </button>
        )}
      </div>

      <div className="relative">
        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar categoria (ex.: mercado, farmácia)"
          className="w-full rounded-lg border border-border bg-surface-muted pl-8 pr-8 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
          aria-label="Buscar categoria"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted" aria-label="Limpar busca">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {query.trim().length >= 2 ? (
        results.length === 0 ? (
          <p className="text-xs text-muted">Nenhuma categoria com esse nome.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {results.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => choose(n.id)}
                className={clsx(
                  "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
                  n.id === value ? "bg-accent text-accent-foreground border-accent" : "border-border hover:bg-surface-muted"
                )}
              >
                <span className="truncate">{pathOf(n)}</span>
                {n.id === value && <Check className="h-3.5 w-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        )
      ) : (
        <>
          {!isTop && parent && (
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                onClick={() => setParentId(levelOf(parent))}
                className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 -ml-1.5 text-muted hover:text-foreground hover:bg-surface-muted"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Voltar
              </button>
              <span className="text-muted">·</span>
              <span className="font-medium text-foreground truncate">{pathOf(parent)}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {!isTop && parent && (
              <button
                type="button"
                onClick={() => choose(parent.id)}
                className={clsx(
                  "col-span-2 sm:col-span-3 flex items-center justify-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-sm min-h-[40px]",
                  parent.id === value ? "bg-accent text-accent-foreground border-accent" : "border-border text-muted hover:bg-surface-muted"
                )}
              >
                Usar só &quot;{parent.name}&quot;
              </button>
            )}
            {shown.map((n) => {
              const isSelected = n.id === value;
              const containsSelected = !isSelected && !!selected && pathOf(selected).startsWith(pathOf(n) + " ›");
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => open(n)}
                  className={clsx(
                    "flex items-center justify-between gap-1 rounded-lg border px-3 py-2 text-left text-sm font-medium min-h-[40px]",
                    isSelected
                      ? "bg-accent text-accent-foreground border-accent"
                      : containsSelected
                        ? "border-accent text-foreground"
                        : "border-border text-foreground bg-surface hover:bg-surface-muted"
                  )}
                >
                  <span className="truncate">{n.name}</span>
                  {n.children.length > 0 ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  ) : (
                    isSelected && <Check className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              );
            })}
            {isTop && (
              <button
                type="button"
                onClick={() => choose("")}
                className={clsx(
                  "flex items-center justify-center rounded-lg border border-dashed px-3 py-2 text-sm min-h-[40px]",
                  !value ? "border-accent text-foreground" : "border-border text-muted hover:bg-surface-muted"
                )}
              >
                Sem categoria
              </button>
            )}
          </div>
          {topLevel.length === 0 && <p className="text-xs text-muted">Nenhuma categoria cadastrada — crie em Planejamento.</p>}
        </>
      )}
    </div>
  );
}

function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}
