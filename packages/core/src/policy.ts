import type { AgentBudget, ButlerPolicy, Merchant, SpendCategory, SpendRecord, SpendRequest } from "./types.ts";

export const DEFAULT_MERCHANTS: Merchant[] = [
  {
    id: "research-summary",
    label: "Research Summary API",
    category: "apis",
    kind: "x402",
    target: "/merchants/research/summary",
    priceUsdc: "0.01",
    enabled: true,
  },
  {
    id: "research-papers",
    label: "Premium Papers API",
    category: "apis",
    kind: "x402",
    target: "/merchants/research/papers",
    priceUsdc: "0.02",
    enabled: true,
  },
  {
    id: "price-feed",
    label: "Realtime Price Feed",
    category: "apis",
    kind: "x402",
    target: "/merchants/data/price-feed",
    priceUsdc: "0.001",
    enabled: true,
  },
  {
    id: "utility-quote",
    label: "Utility Bill Quote",
    category: "bills",
    kind: "x402",
    target: "/merchants/bills/utility-quote",
    priceUsdc: "0.05",
    enabled: true,
  },
  {
    id: "subscription-check",
    label: "Subscription Auditor",
    category: "bills",
    kind: "x402",
    target: "/merchants/bills/subscription-check",
    priceUsdc: "0.03",
    enabled: true,
  },
];

export const DEFAULT_AGENTS: AgentBudget[] = [
  { role: "research", dailyLimitUsdc: "5", categories: ["apis"], enabled: true },
  { role: "bills", dailyLimitUsdc: "20", categories: ["bills"], enabled: true },
  { role: "shopping", dailyLimitUsdc: "10", categories: ["shopping"], enabled: false },
  { role: "broker", dailyLimitUsdc: "1", categories: ["services"], enabled: false },
];

export function createDefaultPolicy(owner: `0x${string}`): ButlerPolicy {
  const now = Math.floor(Date.now() / 1000);
  return {
    version: 1,
    ownerAddress: owner,
    weeklyLimitUsdc: "100",
    dailyLimitUsdc: "25",
    validUntil: now + 30 * 24 * 60 * 60,
    merchants: DEFAULT_MERCHANTS,
    agents: DEFAULT_AGENTS,
  };
}

function parseUsdc(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

function formatUsdc(micro: bigint): string {
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  if (frac === 0n) return whole.toString();
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

function startOfUtcDay(ts: number): number {
  const d = new Date(ts * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

export function sumSpendSince(
  records: SpendRecord[],
  since: number,
  filter?: { agent?: string; category?: SpendCategory }
): bigint {
  return records
    .filter((r) => r.status === "settled" && r.at >= since)
    .filter((r) => (filter?.agent ? r.agent === filter.agent : true))
    .filter((r) => (filter?.category ? r.category === filter.category : true))
    .reduce((acc, r) => acc + parseUsdc(r.amountUsdc), 0n);
}

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateSpend(
  policy: ButlerPolicy,
  request: SpendRequest,
  records: SpendRecord[],
  now = Math.floor(Date.now() / 1000)
): PolicyDecision {
  if (!policy || typeof policy.validUntil !== "number") {
    return { allowed: false, reason: "Policy not configured" };
  }

  if (now > policy.validUntil) {
    return { allowed: false, reason: "Policy expired" };
  }

  if (request.category === "blocked") {
    return { allowed: false, reason: "Category blocked" };
  }

  const merchant = policy.merchants.find((m) => m.id === request.merchantId);
  if (!merchant || !merchant.enabled) {
    return { allowed: false, reason: "Merchant not allowlisted" };
  }

  if (merchant.category !== request.category) {
    return { allowed: false, reason: "Category mismatch for merchant" };
  }

  const agent = policy.agents.find((a) => a.role === request.agent);
  if (!agent || !agent.enabled) {
    return { allowed: false, reason: "Agent disabled" };
  }

  if (!agent.categories.includes(request.category)) {
    return { allowed: false, reason: "Agent not scoped to category" };
  }

  const amount = parseUsdc(request.amountUsdc);
  const dayStart = startOfUtcDay(now);

  const dailyTotal = sumSpendSince(records, dayStart) + amount;
  if (dailyTotal > parseUsdc(policy.dailyLimitUsdc)) {
    return { allowed: false, reason: "Daily policy cap exceeded" };
  }

  const agentDaily = sumSpendSince(records, dayStart, { agent: request.agent }) + amount;
  if (agentDaily > parseUsdc(agent.dailyLimitUsdc)) {
    return { allowed: false, reason: `Agent ${request.agent} daily cap exceeded` };
  }

  return { allowed: true };
}

export function remainingDailyUsdc(
  policy: ButlerPolicy,
  records: SpendRecord[],
  now = Math.floor(Date.now() / 1000)
): string {
  const dayStart = startOfUtcDay(now);
  const spent = sumSpendSince(records, dayStart);
  const cap = parseUsdc(policy.dailyLimitUsdc);
  const left = cap > spent ? cap - spent : 0n;
  return formatUsdc(left);
}
