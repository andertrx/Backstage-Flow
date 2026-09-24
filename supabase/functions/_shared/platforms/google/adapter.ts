import { AppError } from "../../http.ts";
import type { PlatformAdapter } from "../adapter.ts";
import type { PlatformAccount } from "../types.ts";
import { listAccessibleCustomers, search } from "./client.ts";
import { MAX_ACCESSIBLE_CUSTOMERS } from "./config.ts";
import { ACCOUNT_BUDGET_QUERY, BILLING_SETUP_QUERY, mapGoogleFunding, type RawAccountBudget, type RawBillingSetup } from "./funding.ts";
import { mapCustomer, type RawCustomer } from "./mapping.ts";
import { fetchUserInfo, refreshAccessToken } from "./oauth.ts";

const CUSTOMER_QUERY =
  "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.status, customer.manager, customer.test_account FROM customer";

const CLIENTS_QUERY =
  "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.status, customer_client.manager, customer_client.test_account FROM customer_client WHERE customer_client.manager = false";

/**
 * Adaptador Google Ads. O "token" guardado no cofre é o REFRESH TOKEN do OAuth;
 * o token de acesso (1 hora) é obtido aqui a cada uso.
 */
export function createGoogleAdapter(fetchImpl: typeof fetch = fetch): PlatformAdapter {
  const accessToken = async (refreshToken: string) => (await refreshAccessToken(refreshToken, fetchImpl)).access_token;

  async function getCustomer(token: string, customerId: string, loginCustomerId: string): Promise<RawCustomer> {
    const rows = await search<{ customer: RawCustomer }>(customerId, CUSTOMER_QUERY, { accessToken: token, loginCustomerId, fetchImpl });
    if (!rows[0]) throw new AppError(404, "NOT_FOUND", "Conta do Google Ads não encontrada.");
    return rows[0].customer;
  }

  const assertCustomerId = (id: string) => {
    if (!/^\d+$/.test(id)) throw new AppError(400, "INVALID_INPUT", "Customer ID do Google Ads inválido.");
  };

  async function accountWithToken(token: string, externalId: string, managerId: string | null): Promise<PlatformAccount> {
    const customer = await getCustomer(token, externalId, managerId ?? externalId);
    let managerName: string | null = null;
    if (managerId) {
      managerName = (await getCustomer(token, managerId, managerId).catch(() => null))?.descriptiveName ?? null;
    }
    return mapCustomer(customer, managerId ? { id: managerId, name: managerName } : null);
  }

  return {
    platform: "google",

    async validateCredentials(refreshToken) {
      const info = await fetchUserInfo(await accessToken(refreshToken), fetchImpl);
      return { externalUserId: info.sub, name: info.email ?? null };
    },

    async listAccounts(refreshToken) {
      const token = await accessToken(refreshToken);
      const ids = (await listAccessibleCustomers({ accessToken: token, fetchImpl })).slice(0, MAX_ACCESSIBLE_CUSTOMERS);
      const byId = new Map<string, PlatformAccount>();

      for (const id of ids) {
        let customer: RawCustomer;
        try {
          customer = await getCustomer(token, id, id);
        } catch (err) {
          // Token de desenvolvedor sem aprovação afeta tudo: avisa o usuário.
          if (err instanceof AppError && ["DEVELOPER_TOKEN_LIMITED", "CONFIG_ERROR", "AUTH_EXPIRED"].includes(err.code)) throw err;
          // Conta cancelada/sem acesso: pula e segue com as outras.
          console.error(JSON.stringify({ code: "GOOGLE_CUSTOMER_SKIPPED", customerId: id, reason: err instanceof AppError ? err.code : String(err) }));
          continue;
        }

        if (customer.manager) {
          // MCC: lista as contas-cliente abaixo dela.
          const manager = { id, name: customer.descriptiveName ?? null };
          const clients = await search<{ customerClient: RawCustomer }>(id, CLIENTS_QUERY, { accessToken: token, loginCustomerId: id, fetchImpl });
          for (const row of clients) {
            const account = mapCustomer(row.customerClient, manager);
            if (account.externalId && !byId.has(account.externalId)) byId.set(account.externalId, account);
          }
        } else {
          // Acesso direto tem prioridade sobre o acesso via MCC.
          byId.set(id, mapCustomer(customer, null));
        }
      }
      return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async getAccount(refreshToken, externalId, access) {
      assertCustomerId(externalId);
      return accountWithToken(await accessToken(refreshToken), externalId, access?.managerId ?? null);
    },

    async getFunding(refreshToken, externalId, access) {
      assertCustomerId(externalId);
      const token = await accessToken(refreshToken);
      const account = await accountWithToken(token, externalId, access?.managerId ?? null);
      const options = { accessToken: token, loginCustomerId: access?.managerId ?? externalId, fetchImpl };
      // Sem permissão de faturamento, estes dados ficam "não disponíveis" (não derrubam a consulta).
      const optional = async <T>(query: string): Promise<T[] | null> => {
        try {
          return await search<T>(externalId, query, options);
        } catch (err) {
          if (err instanceof AppError && ["AUTH_EXPIRED", "DEVELOPER_TOKEN_LIMITED", "CONFIG_ERROR", "RATE_LIMITED"].includes(err.code)) throw err;
          console.error(JSON.stringify({ code: "GOOGLE_BILLING_UNREADABLE", customerId: externalId, reason: err instanceof AppError ? err.code : String(err) }));
          return null;
        }
      };
      const budgets = (await optional<{ accountBudget: RawAccountBudget }>(ACCOUNT_BUDGET_QUERY))?.map((r) => r.accountBudget) ?? null;
      const billing = (await optional<{ billingSetup: RawBillingSetup }>(BILLING_SETUP_QUERY))?.map((r) => r.billingSetup) ?? null;
      return { account, funding: mapGoogleFunding(account, budgets, billing) };
    },

    listAssets() {
      // Google Ads não tem "páginas/Instagram" como o Meta.
      return Promise.resolve([]);
    },
  };
}

export const googleAdapter = createGoogleAdapter();
