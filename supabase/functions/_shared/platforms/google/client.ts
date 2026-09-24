/**
 * Cliente mínimo da interface REST oficial da Google Ads API.
 * (O Google não tem biblioteca oficial para Node/Deno; a REST é oficial.)
 */
import { AppError } from "../../http.ts";
import { ADS_HOST, apiVersion, env } from "./config.ts";
import { classifyGoogleError } from "./errors.ts";

export interface AdsCallOptions {
  accessToken: string;
  /** MCC que dá acesso à conta (cabeçalho login-customer-id). */
  loginCustomerId?: string | null;
  fetchImpl?: typeof fetch;
}

async function call(path: string, init: RequestInit, options: AdsCallOptions): Promise<unknown> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.accessToken}`,
    "developer-token": env("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "Content-Type": "application/json",
  };
  if (options.loginCustomerId) headers["login-customer-id"] = options.loginCustomerId;

  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(`${ADS_HOST}/${apiVersion()}/${path}`, { ...init, headers });
  } catch (err) {
    throw new AppError(502, "PLATFORM_UNAVAILABLE", "Não conseguimos falar com o Google Ads agora. Tente novamente em instantes.", err);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw classifyGoogleError(response.status, body);
  return body;
}

/** Customer IDs que o usuário autenticado acessa diretamente. */
export async function listAccessibleCustomers(options: AdsCallOptions): Promise<string[]> {
  const body = (await call("customers:listAccessibleCustomers", { method: "GET" }, options)) as { resourceNames?: string[] };
  return (body.resourceNames ?? []).map((name) => name.replace("customers/", ""));
}

/** Executa uma consulta GAQL e percorre todas as páginas. */
export async function search<T>(customerId: string, query: string, options: AdsCallOptions): Promise<T[]> {
  if (!/^\d+$/.test(customerId)) throw new AppError(400, "INVALID_INPUT", "Customer ID do Google Ads inválido.");
  const rows: T[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const body = (await call(
      `customers/${customerId}/googleAds:search`,
      { method: "POST", body: JSON.stringify(pageToken ? { query, pageToken } : { query }) },
      options,
    )) as { results?: T[]; nextPageToken?: string };
    rows.push(...(body.results ?? []));
    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }
  return rows;
}
