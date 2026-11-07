/** Etapa 46.1 — conexão do Google Agenda de cada pessoa: regras puras (sem banco nem rede), para testar. */
export const CALLBACK_PATH = "/google-agenda/retorno";
export const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
/** Só o necessário: ver e editar eventos (inclui criar convites e Meet). Mais openid/email para saber qual conta foi conectada. */
export const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "openid", "email"];
export const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** O endereço de retorno precisa ser a página de retorno do site (https, ou localhost em testes), sem parâmetros. */
export function validRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    const secure = url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost");
    return secure && url.pathname === CALLBACK_PATH && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/** Link de autorização do Google Agenda. `hd` (domínio do Workspace) é só uma dica de qual conta mostrar. */
export function buildAuthorizeUrl(clientId: string, state: string, redirectUri: string, loginHint?: string | null): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", CALENDAR_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // refresh token
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

/** O Google pode devolver menos permissões do que o pedido (a pessoa desmarca); sem editar eventos não adianta conectar. */
export function hasCalendarScope(granted: string | undefined | null): boolean {
  return (granted ?? "").split(/\s+/).includes(CALENDAR_EVENTS_SCOPE);
}

export function newState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
}
