"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

const TIPS = [
  { title: "Planejamento", text: "Defina o valor orçado de cada categoria por mês na aba Planejado." },
  { title: "Lançamentos", text: "Registre receitas e despesas reais. Use filtros para localizar rapidamente." },
  { title: "Dashboard", text: "Acompanhe o comparativo entre planejado e realizado e a evolução mensal." },
  { title: "Investimentos", text: "Cadastre seus aportes e acompanhe a rentabilidade da carteira." },
];

export function HelpPopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Ajuda"
        className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-surface-muted transition text-foreground"
      >
        <HelpCircle className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-surface shadow-lg p-3 z-50">
          <p className="text-sm font-semibold text-foreground mb-2">Como usar</p>
          <ul className="flex flex-col gap-2">
            {TIPS.map((tip) => (
              <li key={tip.title} className="text-xs">
                <span className="font-medium text-foreground">{tip.title}: </span>
                <span className="text-muted">{tip.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
