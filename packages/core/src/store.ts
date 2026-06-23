import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { ButlerPolicy, SpendRecord } from "./types.ts";
import { createDefaultPolicy } from "./policy.ts";

export interface ButlerState {
  policy: ButlerPolicy;
  records: SpendRecord[];
}

const DEFAULT_PATH = resolve(process.cwd(), ".data/butler-state.json");

export function loadState(path = DEFAULT_PATH, owner: `0x${string}` = "0x0000000000000000000000000000000000000001"): ButlerState {
  if (!existsSync(path)) {
    return { policy: createDefaultPolicy(owner), records: [] };
  }
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as ButlerState;
}

export function saveState(state: ButlerState, path = DEFAULT_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(state, null, 2));
}

export function appendRecord(state: ButlerState, record: SpendRecord): ButlerState {
  return { ...state, records: [...state.records, record] };
}
