import { AppError } from "../../http.ts";
import type { PlatformAdapter } from "../adapter.ts";
import type { PlatformAsset } from "../types.ts";
import { graphGet, graphGetAll } from "./client.ts";
import { mapMetaFunding, type RawFundingAccount } from "./funding.ts";
import { mapAccount, mapPages, mergeInstagram, type RawAdAccount, type RawInstagram, type RawPage } from "./mapping.ts";
import { fetchMetaBreakdowns } from "./breakdowns.ts";
import { fetchMetaDailyMetrics, fetchMetaPeriodReach, fetchMetaStructure } from "./sync.ts";

const ACCOUNT_FIELDS = "id,account_id,name,currency,timezone_name,account_status,disable_reason,is_prepay_account,business{id,name}";
const MONEY_FIELDS = "amount_spent,balance,spend_cap";
/** funding_source_details exige permissão de gerenciar a conta; sem ela, lemos o resto. */
const FUNDING_FIELD = "funding_source_details";

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

    async getFunding(token, externalId) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      const path = `act_${externalId}`;
      let raw: RawFundingAccount;
      try {
        raw = await graphGet<RawFundingAccount>(path, { fields: `${ACCOUNT_FIELDS},${MONEY_FIELDS},${FUNDING_FIELD}` }, token, fetchImpl);
      } catch (err) {
        if (!(err instanceof AppError && err.code === "PERMISSION_DENIED")) throw err;
        raw = await graphGet<RawFundingAccount>(path, { fields: `${ACCOUNT_FIELDS},${MONEY_FIELDS}` }, token, fetchImpl);
      }
      return { account: mapAccount(raw), funding: mapMetaFunding(raw) };
    },
    fetchStructure(token, externalId, _access, currency) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      return fetchMetaStructure(token, externalId, currency, fetchImpl);
    },

    fetchDailyMetrics(token, externalId, _access, range) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      return fetchMetaDailyMetrics(token, externalId, range, fetchImpl);
    },

    fetchPeriodReach(token, externalId, _access, ranges) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      return fetchMetaPeriodReach(token, externalId, ranges, fetchImpl);
    },

    fetchBreakdowns(token, externalId, _access, range) {
      if (!/^\d+$/.test(externalId)) throw new AppError(400, "INVALID_INPUT", "Id de conta Meta inválido.");
      return fetchMetaBreakdowns(token, externalId, range, fetchImpl);
    },

    async listAssets(token, externalId) {
      const path = `act_${externalId}/promote_pages`;
      let assets: PlatformAsset[];
      try {
        const pages = await graphGetAll<RawPage>(path, { fields: "id,name,instagram_business_account{id,username}" }, token, fetchImpl);
        assets = mapPages(pages);
      } catch (err) {
        // Sem permissão para ler o Instagram: busca só as páginas.
        if (!(err instanceof AppError && err.code === "PERMISSION_DENIED")) throw err;
        assets = mapPages(await graphGetAll<RawPage>(path, { fields: "id,name" }, token, fetchImpl));
      }
      // Etapa 42.1: perfis do Instagram autorizados direto na conta de anúncio (não só o ligado a cada página).
      // Se o Meta recusar (permissão), fica só o que veio das páginas.
      try {
        const igs = await graphGetAll<RawInstagram>(`act_${externalId}/instagram_accounts`, { fields: "id,username" }, token, fetchImpl);
        assets = mergeInstagram(assets, igs);
      } catch {
        // sem permissão para esta lista: segue com as páginas
      }
      return assets;
    },
  };
}

export const metaAdapter = createMetaAdapter();
