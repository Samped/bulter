export type AgentRole = "orchestrator" | "research" | "bills" | "shopping" | "broker";

export type SpendCategory = "apis" | "bills" | "shopping" | "services" | "blocked";

export interface Merchant {
  id: string;
  label: string;
  category: SpendCategory;
  /** x402 URL path on Butler API, or on-chain address for direct USDC */
  kind: "x402" | "address";
  target: string;
  priceUsdc?: string;
  enabled: boolean;
}

export interface AgentBudget {
  role: AgentRole;
  dailyLimitUsdc: string;
  categories: SpendCategory[];
  enabled: boolean;
}

export interface ButlerPolicy {
  version: 1;
  ownerAddress: `0x${string}`;
  weeklyLimitUsdc: string;
  dailyLimitUsdc: string;
  validUntil: number;
  merchants: Merchant[];
  agents: AgentBudget[];
}

export type SpendInitiator = "user" | "system" | "cli";

export interface SpendRecord {
  id: string;
  at: number;
  agent: AgentRole;
  category: SpendCategory;
  merchantId: string;
  amountUsdc: string;
  settlementId?: string;
  txHash?: string;
  /** Gateway / on-chain address that signed the x402 payment. */
  payerAddress?: string;
  /** Circle executor wallet configured for this Butler instance. */
  executorAddress?: string;
  /** Who triggered the payment — Mine filter uses `user` only. */
  initiator?: SpendInitiator;
  status: "pending" | "settled" | "blocked" | "failed";
  reason?: string;
}

export interface SpendRequest {
  agent: AgentRole;
  merchantId: string;
  amountUsdc: string;
  category: SpendCategory;
}
