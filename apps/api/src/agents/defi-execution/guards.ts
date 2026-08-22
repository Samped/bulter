/** Hard security guards — fail closed. */

import {
  DEFAULT_SLIPPAGE_BPS,
  MAX_NOTIONAL_USDC,
  MAX_SLIPPAGE_BPS,
  MIN_AMOUNT_USDC,
  findAllowlistedToken,
  isChainAllowed,
  isDefiBroadcastEnabled,
  isDefiMainnetAdaptersEnabled,
  isTargetAllowed,
} from "./allowlist.ts";
import type {
  DefiBlocker,
  DefiIntent,
  DefiPlanStep,
  DefiSecurityCheck,
} from "./types.ts";

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export function parseAmount(raw: string): number | null {
  const n = Number(String(raw).replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function clampSlippageBps(requested?: number): number {
  const n = Number.isFinite(requested) ? Math.round(requested!) : DEFAULT_SLIPPAGE_BPS;
  return Math.max(1, Math.min(MAX_SLIPPAGE_BPS, n));
}

export function validateIntent(intent: DefiIntent): DefiBlocker[] {
  const blockers: DefiBlocker[] = [];

  if (!isChainAllowed(intent.sourceChain)) {
    blockers.push({
      code: "chain_not_allowlisted",
      severity: "hard",
      message: `Source chain ${intent.sourceChain} is not allowlisted.`,
    });
  }
  if (!isChainAllowed(intent.destChain)) {
    blockers.push({
      code: "chain_not_allowlisted",
      severity: "hard",
      message: `Destination chain ${intent.destChain} is not allowlisted.`,
    });
  }

  const tokenIn = findAllowlistedToken(intent.tokenIn.symbol, intent.sourceChain);
  const tokenOut = findAllowlistedToken(intent.tokenOut.symbol, intent.destChain);
  if (!tokenIn) {
    blockers.push({
      code: "token_not_allowlisted",
      severity: "hard",
      message: `${intent.tokenIn.symbol} on ${intent.sourceChain} is not allowlisted. Unknown tokens are rejected.`,
    });
  } else if (normalizeCompare(tokenIn.address, intent.tokenIn.address) === false) {
    blockers.push({
      code: "token_not_allowlisted",
      severity: "hard",
      message: `Token address mismatch for ${intent.tokenIn.symbol} — refusing to proceed.`,
    });
  }
  if (!tokenOut) {
    blockers.push({
      code: "token_not_allowlisted",
      severity: "hard",
      message: `${intent.tokenOut.symbol} on ${intent.destChain} is not allowlisted. Unknown tokens are rejected.`,
    });
  }

  const amount = parseAmount(intent.amountIn);
  if (amount == null || amount < MIN_AMOUNT_USDC) {
    blockers.push({
      code: "amount_exceeds_cap",
      severity: "hard",
      message: `Amount must be at least ${MIN_AMOUNT_USDC}.`,
    });
  } else if (amount > MAX_NOTIONAL_USDC) {
    blockers.push({
      code: "amount_exceeds_cap",
      severity: "hard",
      message: `Amount ${amount} exceeds per-tx cap of ${MAX_NOTIONAL_USDC} USDC-equivalent. Raise via code review only.`,
    });
  }

  if (intent.slippageBps > MAX_SLIPPAGE_BPS) {
    blockers.push({
      code: "slippage_exceeds_cap",
      severity: "hard",
      message: `Slippage ${intent.slippageBps} bps exceeds max ${MAX_SLIPPAGE_BPS} bps.`,
    });
  }

  if (intent.recipient && !ADDR_RE.test(intent.recipient)) {
    blockers.push({
      code: "recipient_invalid",
      severity: "hard",
      message: "Recipient must be a 20-byte hex address.",
    });
  }

  // Arc testnet: no DEX — block pure swaps on arc
  if (
    intent.action === "swap" &&
    intent.sourceChain === "arc-testnet" &&
    intent.destChain === "arc-testnet"
  ) {
    blockers.push({
      code: "dex_unavailable_on_chain",
      severity: "hard",
      message:
        "Arc testnet has no DEX. Use a CCTP bridge plan (USDC → another chain) or quote on an allowlisted L2/mainnet.",
    });
  }

  if (
    (intent.action === "swap" || intent.action === "swap-then-bridge") &&
    intent.sourceChain !== "arc-testnet" &&
    !isDefiMainnetAdaptersEnabled()
  ) {
    blockers.push({
      code: "dex_unavailable_on_chain",
      severity: "soft",
      message:
        "Mainnet DEX adapters are plan-stubbed (BUTLER_DEFI_MAINNET_ADAPTERS≠true). Quotes are indicative only.",
    });
  }

  if (intent.tokenOut.address === "0x0000000000000000000000000000000000000000") {
    blockers.push({
      code: "token_not_allowlisted",
      severity: "hard",
      message: `${intent.tokenOut.symbol} is not on the allowlist — refusing unknown token.`,
    });
  }

  if (intent.mode === "execute") {
    if (!isDefiBroadcastEnabled()) {
      blockers.push({
        code: "execution_disabled",
        severity: "hard",
        message:
          "Broadcast execution is disabled (BUTLER_DEFI_BROADCAST≠true). Butler returns plans only — ButlerSpendEnforcer cannot authorize swaps.",
      });
    }
    if (!intent.confirmNonce?.trim()) {
      blockers.push({
        code: "confirm_required",
        severity: "hard",
        message: "Execute mode requires confirmNonce from a prior plan deliverable.",
      });
    }
  }

  return blockers;
}

function normalizeCompare(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function validatePlanTargets(steps: DefiPlanStep[]): DefiBlocker[] {
  const blockers: DefiBlocker[] = [];
  for (const step of steps) {
    if (!step.target) continue;
    if (!isTargetAllowed(step.target)) {
      blockers.push({
        code: "router_not_allowlisted",
        severity: "hard",
        message: `Step ${step.id} targets non-allowlisted contract ${step.target}.`,
      });
    }
  }
  return blockers;
}

export function buildSecurityChecks(
  intent: DefiIntent,
  blockers: DefiBlocker[],
): DefiSecurityCheck[] {
  const hard = blockers.filter((b) => b.severity === "hard");
  return [
    {
      id: "allowlist-tokens",
      passed: !hard.some((b) => b.code === "token_not_allowlisted"),
      label: "Token allowlist",
      detail: "Only code-listed tokens accepted; no arbitrary ERC-20s.",
    },
    {
      id: "allowlist-chains",
      passed: !hard.some((b) => b.code === "chain_not_allowlisted"),
      label: "Chain allowlist",
      detail: "Source and destination must be explicitly enabled.",
    },
    {
      id: "notional-cap",
      passed: !hard.some((b) => b.code === "amount_exceeds_cap"),
      label: `Notional ≤ ${MAX_NOTIONAL_USDC} USDC`,
      detail: "Per-transaction cap enforced in guards (raise only via PR).",
    },
    {
      id: "slippage-cap",
      passed: !hard.some((b) => b.code === "slippage_exceeds_cap"),
      label: `Slippage ≤ ${MAX_SLIPPAGE_BPS} bps`,
      detail: "Protects against sandwich / bad quotes.",
    },
    {
      id: "no-blind-broadcast",
      passed: intent.mode !== "execute" || isDefiBroadcastEnabled(),
      label: "No blind broadcast",
      detail: "Default mode is quote/plan. Live txs require BUTLER_DEFI_BROADCAST=true + confirmNonce.",
    },
    {
      id: "enforcer-aware",
      passed: true,
      label: "Spend enforcer aware",
      detail:
        "Current ButlerSpendEnforcer only allows USDC transfer. Swaps need a separate audited enforcer before broadcast.",
    },
    {
      id: "target-allowlist",
      passed: !hard.some((b) => b.code === "router_not_allowlisted"),
      label: "Router / messenger allowlist",
      detail: "Plan targets must match known CCTP / router addresses.",
    },
  ];
}

export function scoreRisk(blockers: DefiBlocker[], intent: DefiIntent): {
  riskScore: number;
  riskLabel: "low" | "moderate" | "elevated" | "critical";
} {
  let score = 15;
  if (intent.action === "bridge" || intent.action === "swap-then-bridge") score += 15;
  if (intent.action === "swap" || intent.action === "swap-then-bridge") score += 20;
  if (intent.sourceChain !== intent.destChain) score += 10;
  if (intent.slippageBps >= 80) score += 10;
  score += blockers.filter((b) => b.severity === "soft").length * 8;
  score += blockers.filter((b) => b.severity === "hard").length * 25;
  score = Math.min(100, score);
  const riskLabel =
    score >= 75 ? "critical" : score >= 55 ? "elevated" : score >= 35 ? "moderate" : "low";
  return { riskScore: score, riskLabel };
}
