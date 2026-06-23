/**
 * Lepton Butler CLI — pays x402 merchants on Arc via Circle Gateway.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { GatewayClient } from "@circle-fin/x402-batching/client";
import { buildAgentTasks, type Merchant } from "@butler/core";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
config({ path: resolve(ROOT, ".env") });

const apiBase = process.env.VITE_API_URL ?? process.env.BUTLER_API_URL ?? "http://localhost:3001";
const taskBrief = process.env.BUTLER_TASK_BRIEF ?? "policy merchant sweep";

async function fetchMerchants(): Promise<Merchant[]> {
  const res = await fetch(`${apiBase}/api/merchants`);
  if (!res.ok) throw new Error(`merchants: ${res.status}`);
  return res.json() as Promise<Merchant[]>;
}

async function fetchLedger() {
  const res = await fetch(`${apiBase}/api/ledger`);
  if (!res.ok) throw new Error(`ledger: ${res.status}`);
  return res.json() as Promise<{ remainingDailyUsdc: string; records: unknown[] }>;
}

async function main() {
  console.log("==> Butler orchestrator (x402)");
  console.log("  API:", apiBase);

  const ledger = await fetchLedger();
  console.log("  daily budget remaining:", ledger.remainingDailyUsdc, "USDC");

  const merchants = await fetchMerchants();
  const merchantById = new Map(merchants.map((m) => [m.id, m]));
  const tasks = buildAgentTasks(merchants);

  const pk = process.env.BUTLER_EXECUTOR_PRIVATE_KEY ?? process.env.PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x") || pk.length !== 66) {
    console.error("Set BUTLER_EXECUTOR_PRIVATE_KEY or log in via Circle CLI in the dashboard.");
    process.exit(1);
  }

  const client = new GatewayClient({ chain: "arcTestnet", privateKey: pk as `0x${string}` });

  console.log("\n==> Executing enabled policy merchants");
  for (const task of tasks) {
    const merchant = merchantById.get(task.merchantId);
    if (!merchant?.enabled) {
      console.log(`  skip ${task.merchantId} (disabled)`);
      continue;
    }

    console.log(`\n  [${task.agent}] ${task.label}`);
    console.log("    pay", merchant.id, `(${merchant.priceUsdc} USDC)`);

    try {
      const params = new URLSearchParams({ brief: taskBrief });
      const url = `${apiBase}${merchant.target}?${params}`;
      const { status, data } = await client.pay(url);
      console.log("    status:", status);
      console.log("    data:", JSON.stringify(data).slice(0, 120), "...");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("    failed:", message.split("\n")[0]);
    }
  }

  const after = await fetchLedger();
  console.log("\n==> Done");
  console.log("  daily remaining:", after.remainingDailyUsdc, "USDC");
  console.log("  ledger entries:", after.records.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
