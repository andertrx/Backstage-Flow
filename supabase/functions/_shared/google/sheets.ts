/**
 * Google Sheets (Etapa 39): leitura das planilhas pela API oficial, com a
 * conta de serviço do Google (chave JSON no cofre do Supabase).
 *
 * Autenticação: JWT assinado com a chave privada (RS256) trocado por um token
 * de acesso de 1 hora, só com permissão de LEITURA de planilhas
 * (spreadsheets.readonly). O CRM só enxerga as planilhas compartilhadas com o
 * e-mail da conta de serviço.
 */

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TIMEOUT_MS = 20_000;

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/** Erro com mensagem em português para a tela (o técnico vai só para o log). */
export class SheetsError extends Error {
  constructor(public status: number, public code: string, public userMessage: string, public technical?: unknown) {
    super(userMessage);
  }
}

export function parseServiceAccount(raw: string | null | undefined): ServiceAccount {
  if (!raw?.trim()) throw new SheetsError(400, "SHEETS_NOT_CONFIGURED", "A conta do Google ainda não foi configurada (Configurações → Integrações → Google Sheets).");
  try {
    const j = JSON.parse(raw);
    if (j?.type === "service_account" && typeof j.client_email === "string" && typeof j.private_key === "string") {
      return { client_email: j.client_email, private_key: j.private_key };
    }
  } catch { /* cai no erro abaixo */ }
  throw new SheetsError(400, "SHEETS_NOT_CONFIGURED", "A chave do Google guardada não é válida. Cole a chave de novo em Configurações → Integrações.");
}

const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** JWT da conta de serviço (assinado com RS256). */
export async function signServiceJwt(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  } catch (err) {
    throw new SheetsError(400, "SHEETS_BAD_KEY", "A chave privada do Google está corrompida. Gere uma chave nova no Google Cloud e cole no CRM.", err);
  }
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

type Fetch = typeof fetch;

async function call(fetchFn: Fetch, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchFn(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new SheetsError(502, "SHEETS_UNREACHABLE", "Não conseguimos falar com o Google agora. Tente de novo em instantes.", err);
  }
}

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

/** Token de acesso (reaproveitado até 5 min antes de vencer). */
export async function accessToken(sa: ServiceAccount, fetchFn: Fetch = fetch): Promise<string> {
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.expiresAt - 300_000 > Date.now()) return cached.token;
  const assertion = await signServiceJwt(sa);
  const res = await call(fetchFn, TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.access_token !== "string") {
    throw new SheetsError(400, "SHEETS_AUTH_FAILED",
      "O Google recusou a chave da conta de serviço (ela pode ter sido apagada ou desativada no Google Cloud). Gere uma chave nova e cole no CRM.",
      { status: res.status, error: body.error, description: body.error_description });
  }
  tokenCache.set(sa.client_email, { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 });
  return body.access_token;
}

/** Erro da API do Sheets → mensagem prática. */
export function sheetsApiError(status: number, body: { error?: { message?: string; status?: string } } | null, serviceEmail: string): SheetsError {
  const message = body?.error?.message ?? "";
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(`${message} ${body?.error?.status ?? ""}`)) {
    return new SheetsError(400, "SHEETS_API_DISABLED", "A API do Google Sheets está desligada no projeto do Google Cloud. Ative \"Google Sheets API\" e tente de novo.", body);
  }
  if (status === 403) {
    return new SheetsError(400, "SHEETS_NOT_SHARED", `A planilha não está compartilhada com o CRM. No Google Sheets, clique em Compartilhar e adicione ${serviceEmail} como Leitor.`, body);
  }
  if (status === 404) return new SheetsError(404, "SHEETS_NOT_FOUND", "Planilha não encontrada. Confira o link.", body);
  if (status === 400 && /Unable to parse range/i.test(message)) {
    return new SheetsError(400, "SHEETS_TAB_NOT_FOUND", "A aba escolhida não existe mais na planilha (pode ter sido renomeada). Escolha a aba de novo.", body);
  }
  if (status === 429) return new SheetsError(429, "SHEETS_RATE_LIMITED", "O Google pediu uma pausa nas leituras. Tente de novo em 1 minuto.", body);
  return new SheetsError(502, "SHEETS_ERROR", "O Google não respondeu como esperado. Tente de novo em instantes.", { status, body });
}

export interface SheetTab { title: string; rowCount: number; columnCount: number }

export class SheetsClient {
  constructor(private sa: ServiceAccount, private fetchFn: Fetch = fetch) {}

  private async get(url: string) {
    const token = await accessToken(this.sa, this.fetchFn);
    const res = await call(this.fetchFn, url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw sheetsApiError(res.status, body, this.sa.client_email);
    return body;
  }

  /** Título e abas da planilha. */
  async inspect(spreadsheetId: string): Promise<{ title: string; tabs: SheetTab[] }> {
    const body = await this.get(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(title,gridProperties(rowCount,columnCount))`);
    return {
      title: String(body?.properties?.title ?? ""),
      tabs: (body?.sheets ?? []).map((s: { properties: { title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }) => ({
        title: s.properties.title,
        rowCount: s.properties.gridProperties?.rowCount ?? 0,
        columnCount: s.properties.gridProperties?.columnCount ?? 0,
      })),
    };
  }

  /** Valores (texto como aparece na planilha) de um intervalo, ex.: 'Leads'!A1:ZZ21. */
  async values(spreadsheetId: string, range: string): Promise<string[][]> {
    const body = await this.get(`${SHEETS_URL}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`);
    return ((body?.values ?? []) as unknown[][]).map((row) => row.map((v) => String(v ?? "")));
  }
}

/** 'Nome da aba' com aspas escapadas, para usar em intervalos. */
export function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** Linhas a partir do cabeçalho: { headers, rows } (linhas vazias ficam de fora). */
export function splitHeader(values: string[][]): { headers: string[]; rows: string[][] } {
  const [head = [], ...rest] = values;
  const headers = head.map((h) => h.trim());
  return { headers, rows: rest.filter((r) => r.some((c) => c.trim() !== "")) };
}
