"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, Receipt, PiggyBank, Landmark, CreditCard, MessageCircle, Layers } from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/planejamento", label: "Planejamento", icon: ListChecks },
  { href: "/lancamentos", label: "Lançamentos", icon: Receipt },
  { href: "/bancos", label: "Bancos", icon: Landmark },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/parcelamentos", label: "Parcelamentos", icon: Layers },
  { href: "/investimentos", label: "Investimentos", icon: PiggyBank },
  { href: "/assistente", label: "Assistente IA", icon: MessageCircle },
];

export function AppNav({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className={className}>
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-accent text-accent-foreground"
                : "text-foreground hover:bg-surface-muted"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex sm:hidden border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] overflow-x-auto">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              "shrink-0 basis-1/5 flex flex-col items-center gap-0.5 py-2 text-[11px]",
              active ? "text-accent" : "text-muted"
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
