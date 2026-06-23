import {
  getMarketplaceAgent,
  listMarketplaceAgents,
  type MarketplaceAgent,
} from "./agent-registry.ts";
import { getMarketplaceEtf, MARKETPLACE_ETFS } from "./marketplace.ts";

export type TaskStrategy = "etf" | "workflow" | "direct";

export interface TaskPlan {
  strategy: TaskStrategy;
  agentIds: string[];
  etfId?: string;
  reason: string;
  estimatedUsdc: string;
  etaSeconds: number;
  /** How the route was chosen (API layer). */
  router?: "openai" | "heuristic";
}

export function sumAgentPrices(agentIds: string[]): { total: string; eta: number } {
  let micro = 0n;
  let eta = 0;
  for (const id of agentIds) {
    const agent = getMarketplaceAgent(id);
    if (!agent) continue;
    const [w, f = ""] = agent.priceUsdc.split(".");
    micro += BigInt(w) * 1_000_000n + BigInt((f + "000000").slice(0, 6));
    eta += agent.etaSeconds;
  }
  const whole = micro / 1_000_000n;
  const frac = micro % 1_000_000n;
  const total =
    frac === 0n ? whole.toString() : `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
  return { total, eta };
}

function scoreAgent(agent: MarketplaceAgent, task: string): number {
  const t = task.toLowerCase();
  let score = 0;
  for (const cap of agent.capabilities) {
    if (t.includes(cap)) score += 4;
    if (cap.includes("-") && t.includes(cap.split("-")[0]!)) score += 2;
  }
  const hints: Record<string, string[]> = {
    "news-agent": ["news", "headline", "headlines", "feed", "ticker"],
    "market-agent": ["price", "market", "stock", "quote", "nvda", "nvidia", "btc", "crypto"],
    "research-agent": ["research", "paper", "papers", "deep dive", "analysis"],
    "sentiment-agent": ["sentiment", "social", "mood", "bullish", "bearish"],
    "chart-agent": ["chart", "technical", "support", "resistance", "rsi", "pattern"],
    "report-agent": ["report", "investment", "summary", "brief", "synthesize"],
    "audit-agent": ["audit", "solidity", "contract", "security", "slither", "smart contract"],
    "defi-agent": ["defi", "yield", "tvl", "protocol", "uniswap", "aave", "liquidity"],
    "macro-agent": ["macro", "fed", "rates", "cpi", "inflation", "economy"],
    "onchain-agent": ["onchain", "on-chain", "whale", "flows", "holders", "network"],
    "competitor-agent": ["competitor", "moat", "versus", "vs", "market share", "landscape"],
    "risk-agent": ["risk", "hedge", "drawdown", "volatility", "portfolio"],
    "bill-agent": ["utility", "bill", "invoice", "electricity", "energy"],
    "subscription-agent": ["subscription", "saas", "recurring", "netflix", "spending"],
  };
  for (const kw of hints[agent.id] ?? []) {
    if (t.includes(kw)) score += 3;
  }
  return score;
}

function matchEtf(task: string): TaskPlan | null {
  const t = task.toLowerCase();

  for (const etf of MARKETPLACE_ETFS) {
    const name = etf.name.toLowerCase();
    const desc = etf.description.toLowerCase();
    const tokens = [...name.split(/\s+/), ...desc.split(/\s+/)].filter((w) => w.length > 3);
    const hits = tokens.filter((w) => t.includes(w)).length;
    if (hits >= 2) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Matched workflow "${etf.name}" for this task.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  if (/bill|subscription|utility|invoice/.test(t)) {
    const etf = getMarketplaceEtf("bill-audit-bundle");
    if (etf) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Matched workflow "${etf.name}" for this task.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  if (/btc|bitcoin|onchain|on-chain/.test(t)) {
    const wantsFullThesis =
      /thesis|investment|bull|bear|whale|defi|aave|uniswap|support|resistance|executive|deep|comprehensive|scenario|risk|macro|sentiment/.test(
        t
      );
    const full = getMarketplaceEtf("btc-full-thesis-etf");
    if (wantsFullThesis && full) {
      return {
        strategy: "etf",
        etfId: full.id,
        agentIds: full.agentIds,
        reason: `Matched workflow "${full.name}" for comprehensive BTC investment thesis.`,
        estimatedUsdc: full.bundlePriceUsdc,
        etaSeconds: full.etaSeconds,
      };
    }
    const etf = getMarketplaceEtf("btc-onchain-etf");
    if (etf) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Matched workflow "${etf.name}" for on-chain crypto research.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  if (/defi|yield|tvl|uniswap|aave/.test(t)) {
    const etf = getMarketplaceEtf("defi-alpha-etf");
    if (etf) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Matched workflow "${etf.name}" for DeFi analysis.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  if (/macro|fed\b|rates|cpi|inflation/.test(t)) {
    const etf = getMarketplaceEtf("macro-radar-etf");
    if (etf) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Matched workflow "${etf.name}" for macro briefing.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  return null;
}

function pickBestAgent(task: string): MarketplaceAgent {
  const ranked = listMarketplaceAgents().map((agent) => ({ agent, score: scoreAgent(agent, task) })).sort(
    (a, b) => b.score - a.score
  );
  const best = ranked[0];
  if (best && best.score > 0) return best.agent;
  return listMarketplaceAgents().find((a) => a.id === "research-agent") ?? listMarketplaceAgents()[0]!;
}

/** Validate LLM or manual route selection against the marketplace catalog. */
export function buildTaskPlanFromRoute(input: {
  strategy: TaskStrategy;
  agentIds: string[];
  etfId?: string | null;
  reason: string;
  router?: TaskPlan["router"];
}): TaskPlan | null {
  const reason = input.reason.trim() || "Selected marketplace route.";

  if (input.strategy === "etf" && input.etfId) {
    const etf = getMarketplaceEtf(input.etfId);
    if (!etf) return null;
    return {
      strategy: "etf",
      etfId: etf.id,
      agentIds: etf.agentIds,
      reason,
      estimatedUsdc: etf.bundlePriceUsdc,
      etaSeconds: etf.etaSeconds,
      router: input.router,
    };
  }

  const ids = [...new Set(input.agentIds)].filter((id) => !!getMarketplaceAgent(id));
  if (ids.length === 0) return null;

  const { total, eta } = sumAgentPrices(ids);
  const strategy: TaskStrategy =
    input.strategy === "workflow" || ids.length > 1
      ? "workflow"
      : input.strategy === "direct"
        ? "direct"
        : ids.length === 1
          ? "direct"
          : "workflow";

  return {
    strategy,
    agentIds: ids,
    reason,
    estimatedUsdc: total,
    etaSeconds: eta,
    router: input.router,
  };
}

export function planTaskExecution(params: {
  task: string;
  mode: "auto" | "manual";
  agentIds?: string[];
  etfId?: string | null;
}): TaskPlan {
  const task = params.task.trim();
  if (!task) {
    throw new Error("Describe your task before running.");
  }

  if (params.mode === "manual") {
    if (params.etfId) {
      const etf = getMarketplaceEtf(params.etfId);
      if (!etf) throw new Error("Unknown workflow selected.");
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: `Running selected workflow: ${etf.name}.`,
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
    const ids = (params.agentIds ?? []).filter((id) => !!getMarketplaceAgent(id));
    if (ids.length === 0) throw new Error("Select at least one agent, or switch to Auto mode.");
    const { total, eta } = sumAgentPrices(ids);
    const names = ids.map((id) => getMarketplaceAgent(id)?.name ?? id).join(", ");
    return {
      strategy: ids.length === 1 ? "direct" : "workflow",
      agentIds: ids,
      reason: `Running your selection: ${names}.`,
      estimatedUsdc: total,
      etaSeconds: eta,
    };
  }

  const etf = matchEtf(task);
  if (etf) return etf;

  const t = task.toLowerCase();
  if (/headline|headlines|news/.test(t) && /price|quote|market/.test(t)) {
    const ids = ["news-agent", "market-agent"].filter((id) => !!getMarketplaceAgent(id));
    if (ids.length === 2) {
      const { total, eta } = sumAgentPrices(ids);
      return {
        strategy: "workflow",
        agentIds: ids,
        reason: "Headlines and market price — News Agent plus Market Agent in sequence.",
        estimatedUsdc: total,
        etaSeconds: eta,
      };
    }
  }

  if (/audit|solidity|smart contract|security scan/.test(t)) {
    const agent = getMarketplaceAgent("audit-agent")!;
    return {
      strategy: "direct",
      agentIds: [agent.id],
      reason: "Security and audit tasks route to Audit Agent (best reputation for contract review).",
      estimatedUsdc: agent.priceUsdc,
      etaSeconds: agent.etaSeconds,
    };
  }

  if (
    /research|deep dive|literature|papers|analyst|due diligence/.test(t) &&
    !/headline|headlines only|news feed/.test(t)
  ) {
    const agent = getMarketplaceAgent("research-agent")!;
    return {
      strategy: "direct",
      agentIds: [agent.id],
      reason: "Research tasks route to Research Agent for full briefs with papers, findings, and analysis.",
      estimatedUsdc: agent.priceUsdc,
      etaSeconds: agent.etaSeconds,
    };
  }

  if (/full report|comprehensive|investment report|multi.?agent/.test(t)) {
    const etf = MARKETPLACE_ETFS.find((e) => e.agentIds.includes("report-agent"));
    if (etf) {
      return {
        strategy: "etf",
        etfId: etf.id,
        agentIds: etf.agentIds,
        reason: "Complex report request — orchestrating a multi-agent ETF workflow.",
        estimatedUsdc: etf.bundlePriceUsdc,
        etaSeconds: etf.etaSeconds,
      };
    }
  }

  const best = pickBestAgent(task);
  const runner = getMarketplaceAgent(best.id)!;
  return {
    strategy: "direct",
    agentIds: [runner.id],
    reason: `Auto-selected ${runner.name} based on task keywords and capabilities.`,
    estimatedUsdc: runner.priceUsdc,
    etaSeconds: runner.etaSeconds,
  };
}
