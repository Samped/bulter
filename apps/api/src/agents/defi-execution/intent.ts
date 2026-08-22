/** Parse natural-language briefs into a strict DefiIntent (fail closed on ambiguity). */

import { randomBytes } from "node:crypto";
import {
  DEFAULT_SLIPPAGE_BPS,
  findAllowlistedToken,
} from "./allowlist.ts";
import { clampSlippageBps, parseAmount } from "./guards.ts";
import type { DefiAction, DefiChainId, DefiIntent, DefiMode, DefiTokenRef } from "./types.ts";

const CHAIN_ALIASES: Record<string, DefiChainId> = {
  arc: "arc-testnet",
  "arc-testnet": "arc-testnet",
  "arc testnet": "arc-testnet",
  ethereum: "ethereum",
  eth: "ethereum",
  mainnet: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  optimism: "optimism",
  op: "optimism",
  polygon: "polygon",
  matic: "polygon",
};

function detectMode(t: string): DefiMode {
  if (/\b(execute|broadcast|send\s+tx|submit\s+tx|sign\s+and\s+send)\b/.test(t)) return "execute";
  if (/\b(plan|route|prepare|build\s+tx|calldata)\b/.test(t)) return "plan";
  if (/\b(quote|price|rate|how\s+much)\b/.test(t) && !/\b(swap|bridge)\b/.test(t)) return "quote";
  // Default to plan for swap/bridge language — never execute by default.
  if (/\b(swap|bridge|convert|exchange)\b/.test(t)) return "plan";
  return "quote";
}

function detectAction(t: string): DefiAction {
  const wantsSwap = /\b(swap|exchange|trade|convert)\b/.test(t);
  const wantsBridge = /\b(bridge|cctp|cross[- ]?chain|transfer\s+to)\b/.test(t);
  if (wantsSwap && wantsBridge) return "swap-then-bridge";
  if (wantsBridge) return "bridge";
  if (wantsSwap) return "swap";
  return "quote";
}

function detectChain(t: string, which: "from" | "to" | "any"): DefiChainId | undefined {
  const patterns =
    which === "from"
      ? [
          /(?:from|on)\s+(arc(?:\s+testnet)?|ethereum|eth|mainnet|base|arbitrum|arb|optimism|op|polygon|matic)\b/i,
        ]
      : which === "to"
        ? [
            /(?:to|onto|into)\s+(arc(?:\s+testnet)?|ethereum|eth|mainnet|base|arbitrum|arb|optimism|op|polygon|matic)\b/i,
          ]
        : [
            /\b(arc(?:\s+testnet)?|ethereum|eth|mainnet|base|arbitrum|arb|optimism|op|polygon|matic)\b/i,
          ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const key = m[1].toLowerCase().replace(/\s+/g, " ");
    const hit = CHAIN_ALIASES[key];
    if (hit) return hit;
  }
  return undefined;
}

function detectAmount(t: string): string {
  const m =
    t.match(/\b(\d+(?:\.\d+)?)\s*(?:usdc|usd)\b/i) ||
    t.match(/\$(\d+(?:\.\d+)?)\b/) ||
    t.match(/\b(\d+(?:\.\d+)?)\b/);
  return m?.[1] ?? "10";
}

function detectTokenOut(t: string, chain: DefiChainId): DefiTokenRef {
  // Prefer explicit "to SYMBOL" before generic USDC mentions in the brief.
  const toSym = t.match(/\b(?:to|into)\s+([a-z][a-z0-9]{1,10})\b/i);
  if (toSym?.[1]) {
    const sym = toSym[1].toUpperCase();
    if (!/^(FROM|ON|WITH|USING|SLIPPAGE|PLAN|QUOTE|SWAP|BRIDGE|BASE|ARBITRUM|OPTIMISM|POLYGON|MAINNET|ETHEREUM)$/.test(sym)) {
      const hit = findAllowlistedToken(sym, chain);
      if (hit) return hit;
      // Unknown explicit destination — zero address so guards hard-block.
      return {
        symbol: sym,
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        chain,
      };
    }
  }
  if (/\bweth\b/.test(t)) {
    return findAllowlistedToken("WETH", chain) ?? fallbackUsdc(chain);
  }
  if (/\bto\s+eth\b/.test(t) || (/\beth\b/.test(t) && !/\bethereum\b/.test(t) && /\b(swap|to)\b/.test(t))) {
    return findAllowlistedToken("ETH", chain) ?? findAllowlistedToken("WETH", chain) ?? fallbackUsdc(chain);
  }
  if (/\bto\s+usdc\b/.test(t)) {
    return findAllowlistedToken("USDC", chain) ?? fallbackUsdc(chain);
  }
  // Default destination for swap intents: WETH on DEX chains, USDC otherwise
  return (
    findAllowlistedToken("WETH", chain) ||
    findAllowlistedToken("USDC", chain) ||
    fallbackUsdc(chain)
  );
}

function fallbackUsdc(chain: DefiChainId): DefiTokenRef {
  return (
    findAllowlistedToken("USDC", chain) ?? {
      symbol: "USDC",
      address: "0x0000000000000000000000000000000000000000",
      decimals: 6,
      chain,
      isUsdc: true,
    }
  );
}

function detectRecipient(brief: string): `0x${string}` | undefined {
  const m = brief.match(/\b(0x[a-fA-F0-9]{40})\b/);
  return m?.[1] as `0x${string}` | undefined;
}

function detectConfirmNonce(brief: string): string | undefined {
  const m = brief.match(/\bconfirm(?:Nonce)?[=:\s]+([a-fA-F0-9]{16,64})\b/i);
  return m?.[1];
}

function detectSlippage(t: string): number {
  const m = t.match(/slippage\s*[:=]?\s*(\d+(?:\.\d+)?)\s*%/i);
  if (m?.[1]) return clampSlippageBps(Math.round(Number(m[1]) * 100));
  const bps = t.match(/slippage\s*[:=]?\s*(\d+)\s*bps/i);
  if (bps?.[1]) return clampSlippageBps(Number(bps[1]));
  return DEFAULT_SLIPPAGE_BPS;
}

export function parseDefiIntent(brief?: string): DefiIntent {
  const raw = brief?.trim() || "Quote USDC swap routes";
  const t = raw.toLowerCase();
  const mode = detectMode(t);
  const action = detectAction(t);

  let sourceChain = detectChain(t, "from") ?? detectChain(t, "any");
  let destChain = detectChain(t, "to");

  if (action === "bridge" || action === "swap-then-bridge") {
    sourceChain = sourceChain ?? "arc-testnet";
    destChain = destChain ?? (sourceChain === "base" ? "ethereum" : "base");
    if (sourceChain === destChain) destChain = sourceChain === "base" ? "ethereum" : "base";
  } else if (action === "swap") {
    sourceChain = sourceChain ?? "base";
    destChain = destChain ?? sourceChain;
  } else {
    sourceChain = sourceChain ?? "arc-testnet";
    destChain = destChain ?? sourceChain;
  }

  const amountIn = detectAmount(t);
  const tokenIn =
    findAllowlistedToken("USDC", sourceChain) ??
    fallbackUsdc(sourceChain);
  const tokenOut =
    action === "bridge"
      ? findAllowlistedToken("USDC", destChain) ?? fallbackUsdc(destChain)
      : detectTokenOut(t, destChain);

  // Sanity: amount parse for defaulting
  if (parseAmount(amountIn) == null) {
    /* keep string; guards will block */
  }

  return {
    action,
    mode,
    sourceChain,
    destChain,
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps: detectSlippage(t),
    recipient: detectRecipient(raw),
    confirmNonce: detectConfirmNonce(raw),
    rawBrief: raw,
  };
}

export function newConfirmNonce(): string {
  return randomBytes(16).toString("hex");
}
