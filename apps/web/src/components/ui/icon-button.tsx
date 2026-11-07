import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn.ts";

type Variant = "ghost" | "subtle" | "danger";
type Size = "sm" | "md";

const variants: Record<Variant, string> = {
  ghost: "text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100 active:bg-brand-200",
  danger: "text-slate-500 hover:bg-red-50 hover:text-red-600 active:bg-red-100",
};
const sizes: Record<Size, string> = { sm: "size-8", md: "size-9" };

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "children"> {
  /** Obrigatório: nome da ação (leitor de tela e dica ao passar o mouse). */
  label: string;
  icon: ReactNode;
  variant?: Variant;
  size?: Size;
}

/** Botão só de ícone: área de clique padrão (32/36 px), dica com o nome e o mesmo feedback dos demais botões. */
export function IconButton({ label, icon, variant = "ghost", size = "md", className, type = "button", ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-all duration-150 active:scale-95",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 disabled:cursor-not-allowed disabled:opacity-50",
        "[&_svg]:size-4",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  );
}
