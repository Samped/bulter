/**
 * Code-owned allowlists for DeFi execution.
 * NEVER drive these from empty env vars (empty = allow-all is a known failure mode).
 * To expand coverage, ship a PR that adds explicit entries.
 */

import type { DefiChainId, DefiTokenRef } from "./types.ts";

/** Feature flag — live broadcast is OFF unless explicitly enabled. Default: plan/quote only. */
export function isDefiBroadcastEnabled(): boolean {
  return process.env.BUTLER_DEFI_BROADCAST === "true";
}

/** Mainnet DEX adapters stay dark until this is true AND broadcast is true. */
export function isDefiMainnetAdaptersEnabled(): boolean {
  return process.env.BUTLER_DEFI_MAINNET_ADAPTERS === "true";
}

export const MAX_NOTIONAL_USDC = 500;
export const MAX_SLIPPAGE_BPS = 100; // 1%
export const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%
export const MIN_AMOUNT_USDC = 0.01;

export const ALLOWED_CHAINS: ReadonlySet<DefiChainId> = new Set([
  "arc-testnet",
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
]);

/** Chains where Butler may plan a DEX swap (still non-broadcast by default). */
export const DEX_PLAN_CHAINS: ReadonlySet<DefiChainId> = new Set([
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
]);

/** Arc testnet has native USDC + CCTP only — no DEX. */
export const ARC_TESTNET_USDC =
  "0x3600000000000000000000000000000000000000" as const;

/** Circle CCTP domains (mainnet-style ids; Arc testnet domain 26). */
export const CCTP_DOMAIN: Record<DefiChainId, number | null> = {
  "arc-testnet": 26,
  ethereum: 0,
  base: 6,
  arbitrum: 3,
  optimism: 2,
  polygon: 7,
};

/** Arc testnet CCTP TokenMessengerV2 (Circle published). */
export const ARC_CCTP_TOKEN_MESSENGER =
  "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as const;

/**
 * Allowlisted tokens — address must match exactly (checksum-insensitive compare).
 * Unknown symbols / addresses are hard-blocked.
 */
export const ALLOWED_TOKENS: readonly DefiTokenRef[] = [
  {
    symbol: "USDC",
    address: ARC_TESTNET_USDC,
    decimals: 6,
    chain: "arc-testnet",
    isUsdc: true,
  },
  {
    symbol: "USDC",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    decimals: 6,
    chain: "ethereum",
    isUsdc: true,
  },
  {
    symbol: "USDC",
    address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    decimals: 6,
    chain: "base",
    isUsdc: true,
  },
  {
    symbol: "USDC",
    address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
    decimals: 6,
    chain: "arbitrum",
    isUsdc: true,
  },
  {
    symbol: "USDC",
    address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
    decimals: 6,
    chain: "optimism",
    isUsdc: true,
  },
  {
    symbol: "USDC",
    address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    decimals: 6,
    chain: "polygon",
    isUsdc: true,
  },
  {
    symbol: "WETH",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    decimals: 18,
    chain: "ethereum",
  },
  {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    chain: "base",
  },
  {
    symbol: "WETH",
    address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    decimals: 18,
    chain: "arbitrum",
  },
  {
    symbol: "WETH",
    address: "0x4200000000000000000000000000000000000006",
    decimals: 18,
    chain: "optimism",
  },
  {
    symbol: "ETH",
    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    decimals: 18,
    chain: "ethereum",
  },
  {
    symbol: "ETH",
    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    decimals: 18,
    chain: "base",
  },
  {
    symbol: "ETH",
    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    decimals: 18,
    chain: "arbitrum",
  },
  {
    symbol: "ETH",
    address: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
    decimals: 18,
    chain: "optimism",
  },
];

/** Known router / messenger contracts that may appear in plans. */
export const ALLOWED_TARGETS: ReadonlySet<string> = new Set(
  [
    ARC_CCTP_TOKEN_MESSENGER,
    // Uniswap Universal Router (ethereum) — plan-only until broadcast flag
    "0x3fC91A3afd70395Cc644B9c8283f7e0Ab6C3A4c3",
    // Uniswap Universal Router (base)
    "0x3fC91A3afd70395Cc644B9c8283f7e0Ab6C3A4c3",
  ].map((a) => a.toLowerCase()),
);

export function normalizeAddr(a: string): string {
  return a.trim().toLowerCase();
}

export function findAllowlistedToken(
  symbolOrAddress: string,
  chain: DefiChainId,
): DefiTokenRef | undefined {
  const q = symbolOrAddress.trim();
  const lower = q.toLowerCase();
  return ALLOWED_TOKENS.find((t) => {
    if (t.chain !== chain) return false;
    if (t.symbol.toLowerCase() === lower) return true;
    if (normalizeAddr(t.address) === normalizeAddr(q)) return true;
    return false;
  });
}

export function isChainAllowed(chain: DefiChainId): boolean {
  return ALLOWED_CHAINS.has(chain);
}

export function isTargetAllowed(address: string): boolean {
  return ALLOWED_TARGETS.has(normalizeAddr(address));
}
