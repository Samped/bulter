import type { AgentRole, Merchant } from "./types.ts";

export interface AgentTask {
  agent: AgentRole;
  merchantId: string;
  label: string;
}

/** Build payable tasks from enabled policy merchants. */
export function buildAgentTasks(merchants: Merchant[]): AgentTask[] {
  return merchants
    .filter((m) => m.enabled && m.kind === "x402")
    .map((m) => ({
      agent: merchantAgentRole(m),
      merchantId: m.id,
      label: m.label,
    }));
}

function merchantAgentRole(merchant: Merchant): AgentRole {
  if (merchant.category === "bills") return "bills";
  if (merchant.category === "services") return "broker";
  if (merchant.category === "shopping") return "shopping";
  return "research";
}
