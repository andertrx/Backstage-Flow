import type { CredentialOwner, PlatformAccount, PlatformAsset } from "./types.ts";

/**
 * "Tomada universal" das plataformas de anúncio. Para adicionar uma nova
 * plataforma, basta criar um adaptador que cumpra este contrato e registrá-lo
 * em registry.ts — o resto do sistema não muda.
 *
 * As métricas (insights) entram neste contrato na etapa de sincronização.
 */
export interface PlatformAdapter {
  readonly platform: string;
  /** Confere se a credencial funciona e diz a quem ela pertence. */
  validateCredentials(token: string): Promise<CredentialOwner>;
  /** Contas de anúncio que a credencial consegue acessar. */
  listAccounts(token: string): Promise<PlatformAccount[]>;
  getAccount(token: string, externalId: string): Promise<PlatformAccount>;
  /** Páginas, perfis do Instagram etc. ligados à conta. */
  listAssets(token: string, externalId: string): Promise<PlatformAsset[]>;
}
