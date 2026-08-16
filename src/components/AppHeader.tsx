"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, Wallet, SlidersHorizontal, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { HelpPopover } from "./HelpPopover";
import { AppNav } from "./AppNav";

type Session = { name: string; email: string; avatarColor: string };

export function AppHeader({ session }: { session: Session }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-5 h-14">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-surface-muted transition sm:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-accent flex items-center justify-center">
              <Wallet className="h-4 w-4 text-accent-foreground" />
            </div>
            <span className="font-semibold text-foreground hidden sm:inline">Planner Financeiro</span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href="/lancamentos"
            aria-label="Filtros e ajustes"
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-surface-muted transition text-foreground"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" />
          </Link>
          <HelpPopover />
          <ThemeToggle />
          <UserMenu name={session.name} email={session.email} avatarColor={session.avatarColor} />
        </div>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-surface border-r border-border p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Menu</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-surface-muted"
                aria-label="Fechar menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <AppNav className="flex flex-col gap-1" onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
