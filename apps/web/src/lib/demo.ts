/**
 * MODO DEMONSTRAÇÃO (Etapa 27): o site roda com dados FICTÍCIOS, gerados no
 * próprio navegador. Nada é lido nem gravado no banco real e nenhuma API é
 * chamada. Entra-se por /demo; vale só para esta aba do navegador.
 */
const FLAG = "backstage-demo";
export const DEMO_STORAGE_KEY = "backstage-demo-auth";
export const DEMO_PASSWORD = "demonstracao";

function detect(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.pathname === "/demo") {
      sessionStorage.setItem(FLAG, "1");
      window.history.replaceState(null, "", "/");
      return true;
    }
    return sessionStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

export const isDemoMode = detect();

/** Sai da demonstração e volta ao login do sistema real. */
export function exitDemo() {
  try {
    sessionStorage.removeItem(FLAG);
    sessionStorage.removeItem(DEMO_STORAGE_KEY);
  } catch {
    // sem armazenamento: basta recarregar
  }
  window.location.assign("/login");
}
