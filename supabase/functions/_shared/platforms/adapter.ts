import type {
  AccountAccess,
  AccountFunding,
  CredentialOwner,
  DailyMetric,
  DateRange,
  PeriodReach,
  PlatformAccount,
  PlatformAsset,
  PlatformStructure,
} from "./types.ts";

/**
 * "Tomada universal" das plataformas de anúncio. Para adicionar uma nova
 * plataforma, basta criar um adaptador que cumpra este contrato e registrá-lo
 * em registry.ts — o resto do sistema não muda.
 *
 */
export interface PlatformAdapter {
  readonly platform: string;
  /** Confere se a credencial funciona e diz a quem ela pertence. */
  validateCredentials(token: string): Promise<CredentialOwner>;
  /** Contas de anúncio que a credencial consegue acessar. */
  listAccounts(token: string): Promise<PlatformAccount[]>;
  getAccount(token: string, externalId: string, access?: AccountAccess): Promise<PlatformAccount>;
  /** Páginas, perfis do Instagram etc. ligados à conta. */
  listAssets(token: string, externalId: string, access?: AccountAccess): Promise<PlatformAsset[]>;
  /** Dados atualizados da conta + saldo, limites e problemas de cobrança. */
  getFunding(token: string, externalId: string, access?: AccountAccess): Promise<{ account: PlatformAccount; funding: AccountFunding }>;
  /** Campanhas, conjuntos/grupos e anúncios (sincronização). */
  fetchStructure(token: string, externalId: string, access: AccountAccess | undefined, currency: string | null): Promise<PlatformStructure>;
  /** Números diários de todos os níveis (conta, campanha, conjunto/grupo, anúncio) no período. */
  fetchDailyMetrics(token: string, externalId: string, access: AccountAccess | undefined, range: DateRange, currency: string | null): Promise<DailyMetric[]>;
  /** Alcance de períodos exatos (só plataformas que informam alcance). */
  fetchPeriodReach?(token: string, externalId: string, access: AccountAccess | undefined, ranges: DateRange[]): Promise<PeriodReach[]>;
}
