import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn.ts";

type Variant = "primary" | "secondary" | "subtle" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow-brand active:bg-brand-800 focus-visible:outline-brand-600",
  secondary: "bg-white text-slate-700 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 active:bg-slate-100",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600",
};

// Alturas aproximadas: sm 32px · md 36px · lg 40px. Por serem feitas com espaçamento (e não altura fixa),
// as telas que já ajustam o botão à mão continuam funcionando.
const sizes: Record<Size, string> = {
  sm: "gap-1.5 rounded-lg px-3 py-1.5 text-xs",
  md: "gap-2 rounded-lg px-4 py-2 text-sm",
  lg: "gap-2 rounded-lg px-5 py-2.5 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/**
 * Botão padrão. Estados: passar o mouse, clicar (afunda um pouco), carregando e desabilitado.
 * Hierarquia: primary (ação principal da área) · secondary · subtle (ação de apoio em azul claro) · ghost · danger.
 */
export function Button({ variant = "primary", size = "md", loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
