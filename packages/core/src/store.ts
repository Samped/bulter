import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ButlerPolicy, SpendRecord } from "./types.ts";
import { createDefaultPolicy, DEFAULT_MERCHANTS } from "./policy.ts";

export interface ButlerState {
  policy: ButlerPolicy;
  records: SpendRecord[];
}

const DEFAULT_PATH = resolve(process.cwd(), ".data/butler-state.json");

function readRawStateFile(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Ensure newly shipped merchants (e.g. travel-search) appear in existing policies. */
function mergeDefaultMerchants(policy: ButlerPolicy): { policy: ButlerPolicy; changed: boolean } {
  const have = new Set((policy.merchants ?? []).map((m) => m.id));
  const missing = DEFAULT_MERCHANTS.filter((m) => !have.has(m.id));
  if (missing.length === 0) return { policy, changed: false };
  return {
    policy: { ...policy, merchants: [...policy.merchants, ...missing] },
    changed: true,
  };
}

export function loadState(path = DEFAULT_PATH, owner: `0x${string}` = "0x0000000000000000000000000000000000000001"): ButlerState {
  const fallback = { policy: createDefaultPolicy(owner), records: [] as SpendRecord[] };

  function isValidPolicy(p: unknown): p is ButlerPolicy {
    if (!p || typeof p !== "object") return false;
    const row = p as ButlerPolicy;
    return typeof row.validUntil === "number" && typeof row.dailyLimitUsdc === "string";
  }

  if (!existsSync(path)) {
    saveState(fallback, path);
    return fallback;
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<ButlerState>;
    const records = Array.isArray(raw.records) ? raw.records : [];
    let policy = isValidPolicy(raw.policy) ? raw.policy : createDefaultPolicy(owner);
    const merged = mergeDefaultMerchants(policy);
    policy = merged.policy;
    const state = { policy, records };
    if (!isValidPolicy(raw.policy) || merged.changed) {
      saveState(state, path);
    }
    return state;
  } catch {
    saveState(fallback, path);
    return fallback;
  }
}

export function saveState(state: ButlerState, path = DEFAULT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  const raw = readRawStateFile(path);
  writeFileSync(path, JSON.stringify({ ...raw, policy: state.policy, records: state.records }, null, 2));
}

export function appendRecord(state: ButlerState, record: SpendRecord): ButlerState {
  return { ...state, records: [...state.records, record] };
}
