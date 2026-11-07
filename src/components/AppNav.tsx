"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ListChecks,
  Receipt,
  PiggyBank,
  Landmark,
  CreditCard,
  MessageCircle,
  Layers,
  FileBarChart,
  MoreHorizontal,
  X,
} from "lucide-react";
import { clsx } from "clsx";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard };

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Principal",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
      { href: "/planejamento", label: "Planejamento", icon: ListChecks },
    ],
  },
  {
    title: "Contas e cartões",
    items: [
      { href: "/bancos", label: "Bancos", icon: Landmark },
      { href: "/cartoes", label: "Cartões", icon: CreditCard },
      { href: "/parcelamentos", label: "Parcelamentos", icon: Layers },
    ],
  },
  {
    title: "Patrimônio e análise",
    items: [
      { href: "/investimentos", label: "Investimentos", icon: PiggyBank },
      { href: "/relatorios", label: "Relatórios", icon: FileBarChart },
      { href: "/assistente", label: "Assistente IA", icon: MessageCircle },
    ],
  },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

// Atalhos fixos na barra inferior do celular; o resto fica em "Mais".
const MOBILE_PRIMARY_HREFS = ["/", "/lancamentos", "/cartoes", "/bancos"];

export function AppNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className={clsx("flex flex-col gap-4", className)}>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{group.title}</p>
          {group.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={clsx(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-surface-muted"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = MOBILE_PRIMARY_HREFS.map((href) => ALL_ITEMS.find((i) => i.href === href)!);
  const secondary = ALL_ITEMS.filter((i) => !MOBILE_PRIMARY_HREFS.includes(i.href));
  const moreActive = secondary.some((i) => i.href === pathname);

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-surface border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-foreground">Mais opções</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {secondary.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={clsx(
                      "flex flex-col items-center gap-1.5 rounded-xl border border-border py-3 text-xs",
                      active ? "bg-accent text-accent-foreground border-accent" : "text-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 z-40 flex sm:hidden border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        {primary.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]",
                active ? "text-accent" : "text-muted"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={clsx(
            "flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px]",
            moreActive ? "text-accent" : "text-muted"
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          Mais
        </button>
      </nav>
    </>
  );
}
