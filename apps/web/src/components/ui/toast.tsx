import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/cn.ts";
import { dismissToast, getToasts, subscribeToasts, type ToastTone } from "@/lib/toastStore.ts";

const tones: Record<ToastTone, { box: string; icon: typeof Info; iconColor: string }> = {
  success: { box: "ring-emerald-200", icon: CheckCircle2, iconColor: "text-emerald-600" },
  error: { box: "ring-red-200", icon: AlertCircle, iconColor: "text-red-600" },
  info: { box: "ring-brand-200", icon: Info, iconColor: "text-brand-600" },
};

/** Avisos rápidos no canto da tela (sucesso e erro). Montado uma vez, no início do aplicativo. */
export function ToastViewport() {
  const list = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:items-end" aria-live="polite" data-testid="toasts">
      {list.map((t) => {
        const { box, icon: Icon, iconColor } = tones[t.tone];
        return (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} data-testid="toast"
            className={cn("animate-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl bg-white p-3.5 text-sm text-slate-800 shadow-elevated ring-1", box)}>
            <Icon className={cn("mt-0.5 size-4 shrink-0", iconColor)} aria-hidden />
            <p className="min-w-0 flex-1 break-words">{t.message}</p>
            <button type="button" onClick={() => dismissToast(t.id)} aria-label="Fechar aviso"
              className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
