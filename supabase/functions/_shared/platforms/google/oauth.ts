/**
 * OAuth 2.0 oficial do Google: autorização, troca de código e renovação do
 * token de acesso. O refresh token fica no cofre (Vault); o token de acesso
 * dura cerca de 1 hora e é renovado aqui, sem nunca ir para o navegador.
 */
import { AppError } from "../../http.ts";
import { env, OAUTH_AUTHORIZE_URL, OAUTH_SCOPES, OAUTH_TOKEN_URL, USERINFO_URL } from "./config.ts";
import { classifyGoogleError } from "./errors.ts";

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const url = new URL(OAUTH_AUTHORIZE_URL);
  url.searchParams.set("client_id", env("GOOGLE_OAUTH_CLIENT_ID"));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline"); // pede o refresh token
  url.searchParams.set("prompt", "consent"); // garante que o refresh token venha
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetchImpl(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: env("GOOGLE_OAUTH_CLIENT_SECRET"),
        ...params,
      }),
    });
  } catch (err) {
    throw new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Google agora. Tente novamente em instantes.", err);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw classifyGoogleError(response.status, body);
  return body as TokenResponse;
}

export function exchangeCode(code: string, redirectUri: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri }, fetchImpl);
}

export function refreshAccessToken(refreshToken: string, fetchImpl: typeof fetch = fetch) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}

export async function fetchUserInfo(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<{ sub: string; email?: string }> {
  const response = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw classifyGoogleError(response.status, body);
  return body as { sub: string; email?: string };
}
