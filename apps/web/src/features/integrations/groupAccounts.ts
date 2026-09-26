import { platformBusiness } from "@backstage/shared";
import type { AvailableAccount } from "@/features/ad-accounts/types.ts";

/** Agrupa as contas pela BM (Meta) ou pela MCC (Google) que dá o acesso. */
export function groupByOwner(accounts: AvailableAccount[], platform: string) {
  const business = platformBusiness(platform);
  const none = business.none;
  const groups = new Map<string, AvailableAccount[]>();
  for (const a of accounts) {
    const key = a.businessName ? `${business.short}: ${a.businessName}` : none;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === none ? 1 : b === none ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([owner, list]) => ({ owner, accounts: [...list].sort((x, y) => x.name.localeCompare(y.name, "pt-BR")) }));
}
