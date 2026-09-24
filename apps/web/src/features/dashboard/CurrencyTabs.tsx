import { cn } from "@/lib/cn.ts";

/** Escolha da moeda quando há contas em moedas diferentes (nunca convertemos valores). */
export function CurrencyTabs({ currencies, value, onChange }: { currencies: string[]; value: string | null; onChange: (currency: string) => void }) {
  if (currencies.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="tablist" aria-label="Moeda" className="inline-flex rounded-lg bg-slate-100 p-1">
        {currencies.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === value}
            onClick={() => onChange(c)}
            className={cn("rounded-md px-3 py-1 text-sm font-medium", c === value ? "bg-white shadow-sm" : "text-slate-500 hover:text-slate-800")}
          >
            {c}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Há contas em moedas diferentes. Os valores aparecem separados por moeda, <strong>sem conversão</strong>.
      </p>
    </div>
  );
}
