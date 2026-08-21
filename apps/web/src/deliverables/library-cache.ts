import type { MarketplaceDeliverable } from "../api.ts";
import { getBrowserSessionId } from "../api.ts";

const CACHE_VERSION = 1;
const MAX_ITEMS = 120;

function cacheKey(): string {
  const session = getBrowserSessionId();
  let email = "";
  try {
    const raw = localStorage.getItem("butler.payerIdentity") ?? "";
    email = raw.split("|")[0]?.trim().toLowerCase() ?? "";
  } catch {
    /* ignore */
  }
  const scope = email.includes("@") ? email : session;
  return `butler.library.v${CACHE_VERSION}.${scope}`;
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
  // Server list is authoritative for account isolation — never resurrect
  // cached-only jobs from a previous Circle login on this browser.
  const map = new Map<string, MarketplaceDeliverable>();
  for (const row of remote) map.set(row.id, row);
  for (const row of cached) {
    const cur = map.get(row.id);
    if (!cur) continue;
    if ((!cur.summary || cur.summary.length < 12) && row.summary) {
      map.set(row.id, { ...cur, summary: row.summary });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.at - a.at);
}
