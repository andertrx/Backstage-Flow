import type { PlatformAdapter } from "./adapter.ts";
import { googleAdapter } from "./google/adapter.ts";
import { metaAdapter } from "./meta/adapter.ts";

const ADAPTERS: Record<string, PlatformAdapter> = {
  meta: metaAdapter,
  google: googleAdapter,
};

export function getAdapter(platform: string): PlatformAdapter | undefined {
  return ADAPTERS[platform];
}
