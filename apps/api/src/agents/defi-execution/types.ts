/** DeFi Execution Agent — typed intents, quotes, and non-executable plans. */

export type DefiChainId =
  | "arc-testnet"
  | "ethereum"
  | "base"
  | "arbitrum"
  | "optimism"
  | "polygon";

export type DefiAction = "swap" | "bridge" | "swap-then-bridge" | "quote";

export type DefiMode = "quote" | "plan" | "execute";

export interface DefiTokenRef {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  chain: DefiChainId;
  /** Circle native / CCTP-supported USDC when true. */
  isUsdc?: boolean;
}

export interface DefiIntent {
  action: DefiAction;
  mode: DefiMode;
  sourceChain: DefiChainId;
  destChain: DefiChainId;
  tokenIn: DefiTokenRef;
  tokenOut: DefiTokenRef;
  /** Human amount of tokenIn (not wei). */
  amountIn: string;
  /** Max slippage bps requested by user (clamped by policy). */
  slippageBps: number;
  recipient?: `0x${string}`;
  /** User must pass the same nonce to unlock a future execute step. */
  confirmNonce?: string;
  rawBrief: string;
}

export interface DefiQuoteLeg {
  plugin: string;
  chain: DefiChainId;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutEstimated: string;
  amountOutMin: string;
  priceImpactBps: number;
  gasUsdEstimated: number;
  routeLabel: string;
  /** Opaque route metadata for adapters — never signed blindly. */
  routeId: string;
}

export interface DefiPlanStep {
  id: string;
  kind: "approve" | "swap" | "bridge" | "wait" | "verify";
  title: string;
  detail: string;
  chain: DefiChainId;
  /** Calldata preview — informational only until execution is enabled. */
  target?: `0x${string}`;
  selector?: string;
  valueWei?: string;
  estimatedUsd?: number;
  riskNotes: string[];
}

export type DefiBlockerCode =
  | "token_not_allowlisted"
  | "chain_not_allowlisted"
  | "router_not_allowlisted"
  | "amount_exceeds_cap"
  | "slippage_exceeds_cap"
  | "dex_unavailable_on_chain"
  | "execution_disabled"
  | "confirm_required"
  | "recipient_invalid"
  | "bridge_unsupported_pair"
  | "simulation_required";

export interface DefiBlocker {
  code: DefiBlockerCode;
  severity: "hard" | "soft";
  message: string;
}

export interface DefiSecurityCheck {
  id: string;
  passed: boolean;
  label: string;
  detail: string;
}

export interface DefiExecutionPayload {
  type: "defi-execution";
  mode: DefiMode;
  status: "quoted" | "planned" | "blocked" | "execution-gated";
  intent: DefiIntent;
  quotes: DefiQuoteLeg[];
  steps: DefiPlanStep[];
  blockers: DefiBlocker[];
  securityChecks: DefiSecurityCheck[];
  riskScore: number;
  riskLabel: "low" | "moderate" | "elevated" | "critical";
  summary: string;
  nextActions: string[];
  /** Present only when a plan is ready for a future confirmed execute. */
  confirmNonce?: string;
  executionEnabled: boolean;
  pluginsUsed: string[];
  generatedAt: string;
  source: string;
  brief?: string;
}
