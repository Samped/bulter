import type { MarketplaceDeliverable } from "../api.ts";
import { getBrowserSessionId } from "../api.ts";

const CACHE_VERSION = 1;
const MAX_ITEMS = 120;

function cacheKey(): string {
  return `butler.library.v${CACHE_VERSION}.${getBrowserSessionId()}`;
}

export function loadLibraryCache(): MarketplaceDeliverable[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cacheKey());
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MarketplaceDeliverable[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveLibraryCache(items: MarketplaceDeliverable[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(items.slice(-MAX_ITEMS)));
  } catch {
    /* ignore quota */
  }
}

export function mergeLibraryItems(
  remote: MarketplaceDeliverable[],
  cached: MarketplaceDeliverable[]
): MarketplaceDeliverable[] {
  const map = new Map<string, MarketplaceDeliverable>();
  for (const row of cached) map.set(row.id, row);
  for (const row of remote) map.set(row.id, row);
  return Array.from(map.values()).sort((a, b) => b.at - a.at);
}
