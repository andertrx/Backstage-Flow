import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";

interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg";
}

export function Modal({ title, open, onClose, children, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Com a janela aberta, a página de trás não rola (no celular, arrastar rolava o fundo e "cortava" a janela).
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Altura pela parte VISÍVEL da tela (dvh): no celular, "vh" conta a área atrás da barra do navegador e cortava a janela.
        // No celular a janela vira uma folha de baixo para cima; no computador continua centralizada.
        style={{ maxHeight: "92dvh" }}
        className={`max-h-[92vh] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-xl sm:rounded-xl ${size === "lg" ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar janela">
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
