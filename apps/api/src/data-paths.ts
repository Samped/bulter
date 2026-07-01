import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root — systemd sets BUTLER_ROOT=/home/ubuntu/agent on the VM. */
export function resolveButlerRoot(): string {
  const fromEnv = process.env.BUTLER_ROOT?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function resolveButlerStatePath(): string {
  return resolve(resolveButlerRoot(), ".data/butler-state.json");
}

export function resolveMarketplaceStatePath(): string {
  return resolve(resolveButlerRoot(), ".data/marketplace-state.json");
}
