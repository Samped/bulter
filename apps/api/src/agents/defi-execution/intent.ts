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
  mainnet: "ethereum",
  base: "base",
  arbitrum: "arbitrum",
  arb: "arbitrum",
  optimism: "optimism",
  op: "optimism",
  polygon: "polygon",
  matic: "polygon",
};

/** Chain names safe in "to <chain>" — never bare "eth" (that means the ETH token). */
const TO_CHAIN_NAMES = "arc(?:\\s+testnet)?|ethereum|mainnet|base|arbitrum|arb|optimism|op|polygon|matic";
/** "on/from <chain>" — same list; bare "eth" omitted to avoid "to eth" collisions via any-match. */
const VENUE_CHAIN_NAMES = TO_CHAIN_NAMES;

function detectMode(t: string): DefiMode {
  if (/\b(execute|broadcast|send\s+tx|submit\s+tx|sign\s+and\s+send)\b/.test(t)) return "execute";
  if (/\b(plan|route|prepare|build\s+tx|calldata)\b/.test(t)) return "plan";
  if (/\b(quote|price|rate|how\s+much)\b/.test(t) && !/\b(swap|bridge)\b/.test(t)) return "quote";
  if (/\b(swap|bridge|convert|exchange)\b/.test(t)) return "plan";
  return "quote";
}

function detectAction(t: string): DefiAction {
  const wantsSwap = /\b(swap|exchange|trade|convert)\b/.test(t);
  const wantsBridge = /\b(bridge|cctp|cross[- ]?chain)\b/.test(t);
  if (wantsSwap && wantsBridge) return "swap-then-bridge";
  if (wantsBridge) return "bridge";
  if (wantsSwap) return "swap";
  return "quote";
}

function aliasChain(raw: string): DefiChainId | undefined {
  const key = raw.toLowerCase().replace(/\s+/g, " ").trim();
  return CHAIN_ALIASES[key];
}

/** Venue from "on Base" / "from Arbitrum" — preferred for same-chain swaps. */
function detectVenueChain(t: string): DefiChainId | undefined {
  const on = t.match(new RegExp(`\\bon\\s+(${VENUE_CHAIN_NAMES})\\b`, "i"));
  if (on?.[1]) return aliasChain(on[1]);
  const from = t.match(new RegExp(`\\bfrom\\s+(${VENUE_CHAIN_NAMES})\\b`, "i"));
  if (from?.[1]) return aliasChain(from[1]);
  return undefined;
}

/**
 * Explicit destination *chain* (bridge / cross-chain).
 * Does not treat "to eth" as Ethereum — that is the ETH asset.
 */
function detectDestChain(t: string): DefiChainId | undefined {
  // "to ethereum" / "to base" / "onto arbitrum"
  const m = t.match(new RegExp(`\\b(?:to|onto|into)\\s+(${TO_CHAIN_NAMES})\\b`, "i"));
  if (!m?.[1]) return undefined;
  // If the match is immediately a token phrase ("to eth" never gets here — eth not in TO_CHAIN_NAMES)
  return aliasChain(m[1]);
}

function isTokenOutEth(t: string): boolean {
  return /\bto\s+eth\b/.test(t) || /\binto\s+eth\b/.test(t) || /\bfor\s+eth\b/.test(t);
}

function detectAmount(t: string): string {
  const m =
    t.match(/\$(\d+(?:\.\d+)?)\b/) ||
    t.match(/\b(\d+(?:\.\d+)?)\s*(?:usdc|usd)\b/i) ||
    t.match(/\b(\d+(?:\.\d+)?)\b/);
  return m?.[1] ?? "10";
}

function detectTokenOut(t: string, chain: DefiChainId): DefiTokenRef {
  if (isTokenOutEth(t) || /\bweth\b/.test(t)) {
    if (/\bweth\b/.test(t)) {
      return findAllowlistedToken("WETH", chain) ?? fallbackUsdc(chain);
    }
    return (
      findAllowlistedToken("ETH", chain) ??
      findAllowlistedToken("WETH", chain) ??
      fallbackUsdc(chain)
    );
  }

  const toSym = t.match(/\b(?:to|into)\s+([a-z][a-z0-9]{1,10})\b/i);
  if (toSym?.[1]) {
    const sym = toSym[1].toUpperCase();
    if (
      !/^(FROM|ON|WITH|USING|SLIPPAGE|PLAN|QUOTE|SWAP|BRIDGE|BASE|ARBITRUM|OPTIMISM|POLYGON|MAINNET|ETHEREUM)$/.test(
        sym,
      )
    ) {
      const hit = findAllowlistedToken(sym, chain);
      if (hit) return hit;
      return {
        symbol: sym,
        address: "0x0000000000000000000000000000000000000000",
        decimals: 18,
        chain,
      };
    }
  }

  if (/\bto\s+usdc\b/.test(t)) {
    return findAllowlistedToken("USDC", chain) ?? fallbackUsdc(chain);
  }

  return (
    findAllowlistedToken("WETH", chain) ||
    findAllowlistedToken("ETH", chain) ||
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

  const venue = detectVenueChain(t);
  const explicitDestChain = detectDestChain(t);

  let sourceChain: DefiChainId;
  let destChain: DefiChainId;

  if (action === "bridge" || action === "swap-then-bridge") {
    sourceChain = venue ?? "arc-testnet";
    destChain =
      explicitDestChain && explicitDestChain !== sourceChain
        ? explicitDestChain
        : sourceChain === "base"
          ? "ethereum"
          : "base";
  } else if (action === "swap") {
    // "swap $2 usdc to eth on Base" → both legs on Base (ETH is the asset, not Ethereum).
    sourceChain = venue ?? "base";
    destChain = sourceChain;
    // Only split chains if user named two distinct networks (e.g. "on base to ethereum") — rare; plan will hard-block.
    if (explicitDestChain && explicitDestChain !== sourceChain && !isTokenOutEth(t)) {
      destChain = explicitDestChain;
    }
  } else {
    sourceChain = venue ?? "arc-testnet";
    destChain = explicitDestChain ?? sourceChain;
  }

  const amountIn = detectAmount(t);
  const tokenIn = findAllowlistedToken("USDC", sourceChain) ?? fallbackUsdc(sourceChain);
  const tokenOut =
    action === "bridge"
      ? findAllowlistedToken("USDC", destChain) ?? fallbackUsdc(destChain)
      : detectTokenOut(t, destChain);

  if (parseAmount(amountIn) == null) {
    /* guards will block */
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
