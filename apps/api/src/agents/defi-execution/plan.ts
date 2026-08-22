/** Compose quotes + security-gated execution plans from plugins. */

import { canPlanCctp, planCctp, quoteCctp, CCTP_PLUGIN_ID } from "./adapters/cctp.ts";
import {
  canPlanSwap,
  planSwapStub,
  quoteSwapStub,
  UNISWAP_PLUGIN_ID,
} from "./adapters/uniswap-stub.ts";
import { isDefiBroadcastEnabled } from "./allowlist.ts";
import {
  buildSecurityChecks,
  scoreRisk,
  validateIntent,
  validatePlanTargets,
} from "./guards.ts";
import { newConfirmNonce, parseDefiIntent } from "./intent.ts";
import type {
  DefiBlocker,
  DefiExecutionPayload,
  DefiPlanStep,
  DefiQuoteLeg,
} from "./types.ts";

export function buildDefiExecutionPayload(brief?: string): DefiExecutionPayload {
  const intent = parseDefiIntent(brief);
  const blockers: DefiBlocker[] = [...validateIntent(intent)];
  const quotes: DefiQuoteLeg[] = [];
  const steps: DefiPlanStep[] = [];
  const pluginsUsed: string[] = [];

  if (intent.action === "bridge" || intent.action === "swap-then-bridge" || intent.action === "quote") {
    if (canPlanCctp(intent) || (intent.tokenIn.isUsdc && intent.tokenOut.isUsdc && intent.sourceChain !== intent.destChain)) {
      if (canPlanCctp(intent)) {
        quotes.push(quoteCctp(intent));
        pluginsUsed.push(CCTP_PLUGIN_ID);
        if (intent.mode !== "quote") {
          steps.push(...planCctp(intent));
        }
      } else {
        blockers.push({
          code: "bridge_unsupported_pair",
          severity: "hard",
          message: `CCTP bridge not supported for ${intent.sourceChain} → ${intent.destChain} with these tokens.`,
        });
      }
    }
  }

  if (intent.action === "swap" || intent.action === "swap-then-bridge") {
    if (canPlanSwap(intent)) {
      quotes.push(quoteSwapStub(intent));
      pluginsUsed.push(UNISWAP_PLUGIN_ID);
      if (intent.mode !== "quote") {
        steps.push(...planSwapStub(intent));
      }
    } else if (intent.action === "swap") {
      if (intent.sourceChain !== intent.destChain) {
        blockers.push({
          code: "dex_unavailable_on_chain",
          severity: "hard",
          message: `Same-chain swap required; parsed ${intent.sourceChain} → ${intent.destChain}. Use “on <chain>” for the venue (e.g. “swap USDC to ETH on Base”), or say bridge for cross-chain USDC.`,
        });
      } else if (!blockers.some((b) => b.code === "dex_unavailable_on_chain")) {
        blockers.push({
          code: "dex_unavailable_on_chain",
          severity: "hard",
          message: `No swap plugin available for ${intent.sourceChain}.`,
        });
      }
    }
  }

  // Pure quote with same-chain USDC→WETH language
  if (intent.action === "quote" && quotes.length === 0 && canPlanSwap({ ...intent, action: "swap" })) {
    quotes.push(quoteSwapStub({ ...intent, action: "swap" }));
    pluginsUsed.push(UNISWAP_PLUGIN_ID);
  }

  if (intent.action === "quote" && quotes.length === 0 && canPlanCctp({ ...intent, action: "bridge" })) {
    quotes.push(quoteCctp({ ...intent, action: "bridge" }));
    pluginsUsed.push(CCTP_PLUGIN_ID);
  }

  blockers.push(...validatePlanTargets(steps));

  if (intent.mode === "execute") {
    blockers.push({
      code: "simulation_required",
      severity: "hard",
      message:
        "Execute path refuses to broadcast without an audited DefiExecution enforcer + simulation receipt. Use plan mode.",
    });
  }

  const hardBlock = blockers.some((b) => b.severity === "hard");
  const securityChecks = buildSecurityChecks(intent, blockers);
  const { riskScore, riskLabel } = scoreRisk(blockers, intent);
  const confirmNonce = !hardBlock && intent.mode !== "quote" ? newConfirmNonce() : undefined;
  const executionEnabled = isDefiBroadcastEnabled();

  let status: DefiExecutionPayload["status"] = "quoted";
  if (hardBlock) status = "blocked";
  else if (intent.mode === "execute") status = "execution-gated";
  else if (intent.mode === "plan" || steps.length > 0) status = "planned";

  const summary = buildSummary(intent, status, quotes, blockers, riskLabel);
  const nextActions = buildNextActions(intent, status, confirmNonce, hardBlock);

  return {
    type: "defi-execution",
    mode: intent.mode,
    status,
    intent,
    quotes,
    steps,
    blockers,
    securityChecks,
    riskScore,
    riskLabel,
    summary,
    nextActions,
    confirmNonce,
    executionEnabled,
    pluginsUsed: [...new Set(pluginsUsed)],
    generatedAt: new Date().toISOString(),
    source: "butler-defi-execution",
    brief: brief?.trim() || undefined,
  };
}

function buildSummary(
  intent: ReturnType<typeof parseDefiIntent>,
  status: DefiExecutionPayload["status"],
  quotes: DefiQuoteLeg[],
  blockers: DefiBlocker[],
  riskLabel: string,
): string {
  const hard = blockers.filter((b) => b.severity === "hard");
  if (status === "blocked") {
    return `Blocked (${hard.length} hard guard${hard.length === 1 ? "" : "s"}): ${hard.map((b) => b.message).join(" · ")}`;
  }
  const q = quotes[0];
  const route = q
    ? `${q.amountIn} ${q.tokenIn} → ~${q.amountOutEstimated} ${q.tokenOut} via ${q.routeLabel}`
    : `${intent.amountIn} ${intent.tokenIn.symbol} on ${intent.sourceChain}`;
  return `DeFi ${intent.mode} · ${intent.action} · ${route}. Risk ${riskLabel}. Broadcast ${isDefiBroadcastEnabled() ? "FLAG ON but still gated" : "disabled"} — review plan before any funds move.`;
}

function buildNextActions(
  intent: ReturnType<typeof parseDefiIntent>,
  status: DefiExecutionPayload["status"],
  confirmNonce: string | undefined,
  hardBlock: boolean,
): string[] {
  if (hardBlock) {
    return [
      "Fix hard blockers (token/chain allowlist, amount cap, or unsupported route).",
      "Re-run with an allowlisted pair, e.g. “Plan bridge 25 USDC from arc-testnet to base”.",
    ];
  }
  const actions = [
    "Review security checklist and plan steps in Library.",
    "Verify token addresses against the allowlist — never paste arbitrary contract addresses into approvals.",
  ];
  if (status === "quoted") {
    actions.push("Ask for a full plan: “Plan bridge 25 USDC from arc-testnet to base”.");
  }
  if (confirmNonce) {
    actions.push(
      `Plan confirmNonce=${confirmNonce} — required for any future execute (still blocked until BUTLER_DEFI_BROADCAST + audited enforcer).`,
    );
  }
  if (intent.mode === "execute") {
    actions.push("Execution remains gated. Deploy/audit ButlerDefiExecutionEnforcer before enabling broadcast.");
  }
  return actions;
}
