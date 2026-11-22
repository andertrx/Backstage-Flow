// Confirmação antes de ações sérias (arquivar, desconectar, trocar chave...), no visual do sistema em vez da janela do navegador.
// Uso: if (!(await confirmar({ title: "Arquivar?", message: "...", confirmLabel: "Arquivar" }))) return;
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** "danger" (vermelho) para o que não dá para desfazer facilmente. */
  tone?: "danger" | "default";
}
interface Pending extends ConfirmRequest { resolve: (ok: boolean) => void }

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getConfirm(): Pending | null { return current; }
export function subscribeConfirm(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; }

const PERIGO = ["apagar", "desconectar", "desativar", "remover", "trocar", "excluir"];

/**
 * Texto corrido ("Arquivar X? O histórico continua.") vira título + explicação + botão com o verbo ("Arquivar").
 * Ações que não voltam atrás facilmente (apagar, desconectar, desativar, remover, trocar chave) ficam em vermelho.
 */
export function montarPergunta(texto: string): ConfirmRequest {
  const t = texto.trim();
  const q = t.indexOf("?");
  const title = q >= 0 ? t.slice(0, q + 1).trim() : t;
  const message = q >= 0 ? t.slice(q + 1).trim() || undefined : undefined;
  const palavras = title.replace(/^[¿¡"“]+/, "").split(/\s+/);
  const verbo = (palavras[0]?.toLowerCase() === "deseja" ? palavras[1] : palavras[0]) ?? "";
  const limpo = verbo.replace(/[^\p{L}]/gu, "");
  const confirmLabel = limpo.length >= 3 ? limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase() : "Confirmar";
  return { title, message, confirmLabel, tone: PERIGO.includes(limpo.toLowerCase()) ? "danger" : "default" };
}

export function confirmar(req: ConfirmRequest | string): Promise<boolean> {
  const r = typeof req === "string" ? montarPergunta(req) : req;
  current?.resolve(false); // só uma pergunta por vez
  return new Promise((resolve) => {
    current = { ...r, resolve };
    emit();
  });
}

export function answerConfirm(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}
