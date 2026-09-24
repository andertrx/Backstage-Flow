import { describe, expect, it } from "vitest";
import type { AvailableAccount } from "@/features/ad-accounts/types.ts";
import { groupByOwner } from "./groupAccounts.ts";

const acc = (name: string, businessName: string | null): AvailableAccount => ({
  externalId: name, name, currency: "BRL", timezone: null, status: "ativa", businessName, managerId: null, isTestAccount: null, linkedClientId: null,
});

describe("contas da conexão agrupadas", () => {
  it("Meta: por BM, em ordem alfabética, sem BM por último", () => {
    const g = groupByOwner([acc("Zeta", "STG"), acc("Pessoal", null), acc("Alfa", "STG"), acc("Beta", "Agência B")], "meta");
    expect(g.map((x) => x.owner)).toEqual(["BM: Agência B", "BM: STG", "Sem Business Manager"]);
    expect(g[1].accounts.map((a) => a.name)).toEqual(["Alfa", "Zeta"]);
  });
  it("Google: por MCC", () => {
    expect(groupByOwner([acc("A", "MCC Agência"), acc("B", null)], "google").map((x) => x.owner)).toEqual(["MCC: MCC Agência", "Acesso direto (sem MCC)"]);
  });
});
