import { AppError } from "../../http.ts";
import type { PlatformAdapter } from "../adapter.ts";
import { graphGet, graphGetAll } from "./client.ts";
import { mapAccount, mapPages, type RawAdAccount, type RawPage } from "./mapping.ts";

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status,disable_reason,is_prepay_account,business{id,name}";

export function createMetaAdapter(fetchImpl: typeof fetch = fetch): PlatformAdapter {
  return {
    platform: "meta",

    async validateCredentials(token) {
      const me = await graphGet<{ id: string; name?: string }>("me", { fields: "id,name" }, token, fetchImpl);
      return { externalUserId: me.id, name: me.name ?? null };
    },

    async listAccounts(token) {
      const raw = await graphGetAll<RawAdAccount>("me/adaccounts", { fields: ACCOUNT_FIELDS }, token, fetchImpl);
      return raw.map(mapAccount).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async getAccount(token, externalId) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      return mapAccount(await graphGet<RawAdAccount>(`act_${externalId}`, { fields: ACCOUNT_FIELDS }, token, fetchImpl));
    },

    async listAssets(token, externalId) {
      const path = `act_${externalId}/promote_pages`;
      try {
        const pages = await graphGetAll<RawPage>(path, { fields: "id,name,instagram_business_account{id,username}" }, token, fetchImpl);
        return mapPages(pages);
      } catch (err) {
        // Sem permissão para ler o Instagram: busca só as páginas.
        if (err instanceof AppError && err.code === "PERMISSION_DENIED") {
          return mapPages(await graphGetAll<RawPage>(path, { fields: "id,name" }, token, fetchImpl));
        }
        throw err;
      }
    },
  };
}

export const metaAdapter = createMetaAdapter();
