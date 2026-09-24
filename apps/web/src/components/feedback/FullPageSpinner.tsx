import { Loader2 } from "lucide-react";

export function FullPageSpinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-slate-500" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
