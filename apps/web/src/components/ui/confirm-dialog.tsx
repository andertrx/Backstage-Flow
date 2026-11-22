import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button.tsx";
import { answerConfirm, getConfirm, subscribeConfirm } from "@/lib/confirmStore.ts";

/** Pergunta de confirmação no visual do sistema (montada uma vez, no início do aplicativo). Esc ou clicar fora = Cancelar. */
export function ConfirmViewport() {
  const req = useSyncExternalStore(subscribeConfirm, getConfirm, getConfirm);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus(); // o foco começa no "Cancelar": Enter sem pensar não apaga nada
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") answerConfirm(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [req]);
  if (!req) return null;
  const danger = req.tone === "danger";
  return (
    <div className="animate-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) answerConfirm(false); }}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={req.message ? "confirm-msg" : undefined}
        className="animate-modal-in w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200" data-testid="confirm-dialog">
        <div className="flex items-start gap-3">
          {danger && <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle className="size-5" aria-hidden /></span>}
          <div className="min-w-0 space-y-1.5">
            <h2 id="confirm-title" className="text-base font-semibold text-slate-900">{req.title}</h2>
            {req.message && <p id="confirm-msg" className="whitespace-pre-line text-sm text-slate-600">{req.message}</p>}
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button ref={cancelRef} variant="secondary" onClick={() => answerConfirm(false)} data-testid="confirm-cancel">Cancelar</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => answerConfirm(true)} data-testid="confirm-ok">{req.confirmLabel ?? "Confirmar"}</Button>
        </div>
      </div>
    </div>
  );
}
