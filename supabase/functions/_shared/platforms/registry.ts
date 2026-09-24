import type { PlatformAdapter } from "./adapter.ts";
import { metaAdapter } from "./meta/adapter.ts";

const ADAPTERS: Record<string, PlatformAdapter> = {
  meta: metaAdapter,
};

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return ADAPTERS[platform];
}
