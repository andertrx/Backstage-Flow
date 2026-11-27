// Avisos rápidos ("Salvo!", "Erro ao salvar"): estado simples fora do React, lido pelo <ToastViewport />.
export type ToastTone = "success" | "error" | "info";
export interface ToastAction { label: string; onClick: () => unknown }
export interface Toast { id: number; tone: ToastTone; message: string; action?: ToastAction }

const MAX = 4;
const DURATION: Record<ToastTone, number> = { success: 4000, info: 4000, error: 7000 };
const ACTION_DURATION = 9000;

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const emit = () => listeners.forEach((l) => l());

export function getToasts(): Toast[] { return toasts; }
export function subscribeToasts(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

export function dismissToast(id: number) {
  const t = timers.get(id);
  if (t) { clearTimeout(t); timers.delete(id); }
  if (!toasts.some((x) => x.id === id)) return;
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

function push(tone: ToastTone, message: string, action?: ToastAction): number {
  const text = message.trim();
  if (!text) return -1;
  // A mesma mensagem repetida não empilha.
  const same = toasts.find((x) => x.tone === tone && x.message === text);
  if (same) { dismissToast(same.id); }
  const id = ++seq;
  toasts = [...toasts, { id, tone, message: text, ...(action ? { action } : {}) }].slice(-MAX);
  // Aviso com botão ("Desfazer") fica mais tempo na tela.
  timers.set(id, setTimeout(() => dismissToast(id), action ? ACTION_DURATION : DURATION[tone]));
  emit();
  return id;
}

export const toast = {
  success: (message: string, action?: ToastAction) => push("success", message, action),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
};

/** Só para testes. */
export function resetToasts() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  toasts = [];
  emit();
}
