import { type ComponentProps, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from "react";
import { cn } from "@/lib/cn.ts";

const control =
  "block w-full rounded-xl border-0 bg-white px-3.5 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 transition-shadow duration-150 " +
  "placeholder:text-slate-400 hover:ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500 disabled:shadow-none";

// Seta própria dos selects (classe `.select-arrow` em index.css). Continuam sendo o select nativo: seguro no celular e nos testes.
const selectArrow = "select-arrow";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}

/** Rótulo + campo + dica, sempre ligados por id (acessibilidade). */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, selectArrow, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-24", className)} {...props} />;
}
