/**
 * Uniswap / aggregator swap planner — STUB.
 * Returns indicative quotes only. Never constructs broadcastable calldata
 * unless BUTLER_DEFI_MAINNET_ADAPTERS=true (still non-broadcast without BUTLER_DEFI_BROADCAST).
 */

import { isDefiMainnetAdaptersEnabled } from "../allowlist.ts";
import type { DefiIntent, DefiPlanStep, DefiQuoteLeg } from "../types.ts";

export const UNISWAP_PLUGIN_ID = "uniswap-universal-router-stub";

/** Shared Universal Router address used on several Uniswap v3 deployments (plan target allowlist). */
export const UNI_UNIVERSAL_ROUTER =
  "0x3fC91A3afd70395Cc644B9c8283f7e0Ab6C3A4c3" as const;

export function canPlanSwap(intent: DefiIntent): boolean {
  if (intent.sourceChain === "arc-testnet") return false;
  if (intent.sourceChain !== intent.destChain && intent.action === "swap") return false;
  return intent.action === "swap" || intent.action === "swap-then-bridge";
}

/**
 * Indicative mid-market stub — NOT a live aggregator quote.
 * When mainnet adapters are enabled, still clearly labeled as estimate until a real API key is wired.
 */
export function quoteSwapStub(intent: DefiIntent): DefiQuoteLeg {
  const amountIn = Number(intent.amountIn) || 0;
  // Placeholder: assume ~3000 USDC/ETH for illustrative ETH out; for USDC pairs 1:1.
  const outIsEth = /eth/i.test(intent.tokenOut.symbol);
  const amountOut = outIsEth
    ? (amountIn / 3000).toFixed(6)
    : amountIn.toFixed(6);
  const minOut = outIsEth
    ? ((amountIn / 3000) * (1 - intent.slippageBps / 10_000)).toFixed(6)
    : (amountIn * (1 - intent.slippageBps / 10_000)).toFixed(6);

  return {
    plugin: UNISWAP_PLUGIN_ID,
    chain: intent.sourceChain,
    tokenIn: intent.tokenIn.symbol,
    tokenOut: intent.tokenOut.symbol,
    amountIn: intent.amountIn,
    amountOutEstimated: amountOut,
    amountOutMin: minOut,
    priceImpactBps: amountIn > 100 ? 12 : 5,
    gasUsdEstimated: intent.sourceChain === "ethereum" ? 8 : 0.4,
    routeLabel: isDefiMainnetAdaptersEnabled()
      ? `Uniswap UR indicative ${intent.tokenIn.symbol}→${intent.tokenOut.symbol} on ${intent.sourceChain}`
      : `STUB quote ${intent.tokenIn.symbol}→${intent.tokenOut.symbol} (enable BUTLER_DEFI_MAINNET_ADAPTERS for adapter path)`,
    routeId: `uni-stub:${intent.sourceChain}:${intent.tokenIn.symbol}:${intent.tokenOut.symbol}:${intent.amountIn}`,
  };
}

export function planSwapStub(intent: DefiIntent): DefiPlanStep[] {
  const enabled = isDefiMainnetAdaptersEnabled();
  return [
    {
      id: "swap-approve",
      kind: "approve",
      title: enabled ? "Approve tokenIn for Universal Router" : "Approve (stub — not executable)",
      detail: `Approve exactly ${intent.amountIn} ${intent.tokenIn.symbol}. Infinite approvals are forbidden.`,
      chain: intent.sourceChain,
      target: UNI_UNIVERSAL_ROUTER,
      selector: "approve(address,uint256)",
      riskNotes: [
        "Exact allowance only.",
        enabled
          ? "Adapter flag on — still requires broadcast flag + new audited enforcer."
          : "Mainnet adapters disabled — this step is documentary.",
      ],
    },
    {
      id: "swap-execute",
      kind: "swap",
      title: enabled ? "Universal Router swap" : "Swap (stub — indicative only)",
      detail: `Swap ${intent.amountIn} ${intent.tokenIn.symbol} → ${intent.tokenOut.symbol} with max ${intent.slippageBps} bps slippage.`,
      chain: intent.sourceChain,
      target: UNI_UNIVERSAL_ROUTER,
      selector: "execute(bytes,bytes[])",
      estimatedUsd: Number(intent.amountIn) || 0,
      riskNotes: [
        "Simulate with eth_call / Tenderly before any broadcast.",
        "MEV: prefer private relay on Ethereum mainnet.",
        "ButlerSpendEnforcer cannot authorize this call today.",
      ],
    },
  ];
}
