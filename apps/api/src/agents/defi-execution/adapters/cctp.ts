/** CCTP USDC bridge planner — Arc testnet + allowlisted domains. Quote/plan only. */

import { ARC_CCTP_TOKEN_MESSENGER, CCTP_DOMAIN } from "../allowlist.ts";
import type { DefiIntent, DefiPlanStep, DefiQuoteLeg } from "../types.ts";

export const CCTP_PLUGIN_ID = "cctp-v2";

export function canPlanCctp(intent: DefiIntent): boolean {
  if (!intent.tokenIn.isUsdc || !intent.tokenOut.isUsdc) return false;
  const from = CCTP_DOMAIN[intent.sourceChain];
  const to = CCTP_DOMAIN[intent.destChain];
  if (from == null || to == null) return false;
  if (intent.sourceChain === intent.destChain) return false;
  return true;
}

export function quoteCctp(intent: DefiIntent): DefiQuoteLeg {
  const amount = intent.amountIn;
  return {
    plugin: CCTP_PLUGIN_ID,
    chain: intent.sourceChain,
    tokenIn: intent.tokenIn.symbol,
    tokenOut: intent.tokenOut.symbol,
    amountIn: amount,
    // CCTP is 1:1 USDC burn/mint minus protocol fees (~0 on many paths; we note soft fee).
    amountOutEstimated: amount,
    amountOutMin: amount,
    priceImpactBps: 0,
    gasUsdEstimated: intent.sourceChain === "arc-testnet" ? 0.02 : 1.5,
    routeLabel: `CCTP USDC ${intent.sourceChain} → ${intent.destChain} (domain ${CCTP_DOMAIN[intent.destChain]})`,
    routeId: `cctp:${intent.sourceChain}:${intent.destChain}:${amount}`,
  };
}

export function planCctp(intent: DefiIntent): DefiPlanStep[] {
  const messenger = ARC_CCTP_TOKEN_MESSENGER;
  const destDomain = CCTP_DOMAIN[intent.destChain];
  return [
    {
      id: "cctp-approve",
      kind: "approve",
      title: "Approve USDC for TokenMessenger",
      detail: `Approve ${intent.amountIn} USDC to CCTP TokenMessenger on ${intent.sourceChain}. Cap approval to exact amount — never infinite.`,
      chain: intent.sourceChain,
      target: messenger,
      selector: "approve(address,uint256)",
      estimatedUsd: 0,
      riskNotes: [
        "Use exact-amount approve only.",
        "ButlerSpendEnforcer today does not cover approve — broadcast remains gated.",
      ],
    },
    {
      id: "cctp-burn",
      kind: "bridge",
      title: "CCTP depositForBurn",
      detail: `Burn ${intent.amountIn} USDC on ${intent.sourceChain}; mint on domain ${destDomain} (${intent.destChain}).`,
      chain: intent.sourceChain,
      target: messenger,
      selector: "depositForBurn(uint256,uint32,bytes32,address)",
      estimatedUsd: Number(intent.amountIn) || 0,
      riskNotes: [
        "Bridge finality depends on Circle attestation latency.",
        "Recipient bytes32 must match the intended mint address.",
        intent.recipient
          ? `Recipient hint: ${intent.recipient}`
          : "Set recipient explicitly before any broadcast.",
      ],
    },
    {
      id: "cctp-wait",
      kind: "wait",
      title: "Wait for attestation",
      detail: "Poll Circle attestation API until message is ready to receive on destination.",
      chain: intent.destChain,
      riskNotes: ["Do not retry burn with the same nonce while pending."],
    },
    {
      id: "cctp-receive",
      kind: "verify",
      title: "Receive message / mint USDC",
      detail: `ReceiveMessage on ${intent.destChain} MessageTransmitter to mint USDC 1:1.`,
      chain: intent.destChain,
      riskNotes: ["Verify minted amount equals burned amount before considering the bridge complete."],
    },
  ];
}
