import type { PlatformAdapter } from "./adapter.ts";
import { googleAdapter } from "./google/adapter.ts";
import { metaAdapter } from "./meta/adapter.ts";

/**
 * Adaptador de cada plataforma (a chave é public.platforms.id e o id do
 * catálogo packages/shared/src/platforms/catalog.ts). Plataforma nova =
 * criar a pasta dela com o adaptador e registrar aqui.
 */
const ADAPTERS: Record<string, PlatformAdapter> = {
  meta: metaAdapter,
  google: googleAdapter,
};

/** Plataformas que o servidor sabe sincronizar. */
export const SUPPORTED_PLATFORMS: readonly string[] = Object.keys(ADAPTERS);

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return Object.hasOwn(ADAPTERS, platform) ? ADAPTERS[platform] : undefined;
}
