import type { LucideIcon } from "lucide-react";

/**
 * Cabeçalho de módulo da Central, no padrão da referência visual (número em
 * degradê, título, descrição e ícone), adaptado ao tema claro.
 */
export function OpsModuleHeader({ number, title, description, icon: Icon }: {
  number?: string;
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:px-7" data-testid="ops-module-header">
      {number ? (
        <span className="min-w-12 bg-gradient-to-br from-blue-500 to-cyan-400 bg-clip-text text-4xl font-black leading-none text-transparent">
          {number}
        </span>
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-[0_0_18px_rgba(37,99,235,0.25)]">
          <Icon className="size-5" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
      {number && <Icon className="ml-auto hidden size-9 shrink-0 text-blue-300 sm:block" aria-hidden />}
    </div>
  );
}
