#!/usr/bin/env node
/** Redeem ERC-7710 delegation to pay merchant USDC on Arc. */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";
import { appendRecord, loadState, saveState, type SpendRecord } from "@butler/core";
import { redeemMerchantPayment, requireKey } from "@butler/delegation";
import type { Delegation } from "@metamask/smart-accounts-kit";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
config({ path: resolve(ROOT, ".env") });

const STATE_PATH = resolve(ROOT, ".data/butler-state.json");
const DELEGATION_PATH = resolve(ROOT, ".data/delegation.json");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const amount = process.argv.find((a) => a.startsWith("--amount="))?.split("=")[1] ?? "0.01";
  const merchantId = process.argv.find((a) => a.startsWith("--merchant="))?.split("=")[1] ?? "research-summary";

  if (!existsSync(DELEGATION_PATH)) {
    console.error("No delegation setup. Run: npm run delegation:setup");
    process.exit(1);
  }

  const saved = JSON.parse(readFileSync(DELEGATION_PATH, "utf8")) as {
    delegations: Delegation[][];
    userHybridAddress: string;
    executorAddress: string;
  };

  const executorKey = requireKey("BUTLER_EXECUTOR_PRIVATE_KEY");

  console.log("==> ERC-7710 merchant payment");
  console.log("  delegator:", saved.userHybridAddress);
  console.log("  executor:", saved.executorAddress);
  console.log("  merchant:", merchantId, "amount:", amount, "USDC");

  const result = await redeemMerchantPayment({
    delegations: saved.delegations,
    executorPrivateKey: executorKey,
    amountUsdc: amount,
    dryRun,
  });

  if (dryRun) {
    console.log("  (dry-run) permission contexts built");
    return;
  }

  console.log("  tx:", result.hash);

  const state = loadState(STATE_PATH);
  const merchant = state.policy.merchants.find((m) => m.id === merchantId);
  const record: SpendRecord = {
    id: crypto.randomUUID(),
    at: Math.floor(Date.now() / 1000),
    agent: merchant?.category === "bills" ? "bills" : "research",
    category: merchant?.category ?? "apis",
    merchantId,
    amountUsdc: amount,
    settlementId: result.hash,
    status: "settled",
  };
  saveState(appendRecord(state, record), STATE_PATH);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
