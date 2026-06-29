import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  getMarketplaceAgent,
  listMarketplaceAgents,
  externalBaselineCredit,
  type AgentCreditScore,
  type MarketplaceJob,
  type ReverseAuction,
} from "./agent-registry.ts";
import {
  computeCreditScore,
  DEFAULT_TREASURY,
  MARKETPLACE_AGENTS,
  type AgentTreasury,
} from "./marketplace.ts";

export interface AgentStats {
  tasksCompleted: number;
  tasksSucceeded: number;
  revenueUsdc: string;
  totalEtaSeconds: number;
}

export interface MarketplaceState {
  version: 1;
  agentStats: Record<string, AgentStats>;
  jobs: MarketplaceJob[];
  auctions: ReverseAuction[];
  treasury: AgentTreasury;
}

const DEFAULT_STATS: AgentStats = {
  tasksCompleted: 0,
  tasksSucceeded: 0,
  revenueUsdc: "0",
  totalEtaSeconds: 0,
};

export function createDefaultMarketplaceState(depositAddress = "0x0000000000000000000000000000000000000000"): MarketplaceState {
  const agentStats: Record<string, AgentStats> = {};
  for (const a of MARKETPLACE_AGENTS) {
    agentStats[a.id] = { ...DEFAULT_STATS };
  }
  return {
    version: 1,
    agentStats,
    jobs: [],
    auctions: [],
    treasury: { ...DEFAULT_TREASURY, depositAddress },
  };
}

export function loadMarketplaceState(path: string, depositAddress?: string): MarketplaceState {
  if (!existsSync(path)) {
    return createDefaultMarketplaceState(depositAddress);
  }
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as MarketplaceState;
    const defaults = createDefaultMarketplaceState(depositAddress);
    return {
      ...defaults,
      ...raw,
      agentStats: { ...defaults.agentStats, ...raw.agentStats },
      treasury: { ...defaults.treasury, ...raw.treasury },
    };
  } catch {
    return createDefaultMarketplaceState(depositAddress);
  }
}

export function saveMarketplaceState(state: MarketplaceState, path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let raw: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  writeFileSync(
    path,
    JSON.stringify(
      {
        ...raw,
        version: state.version,
        agentStats: state.agentStats,
        jobs: state.jobs,
        auctions: state.auctions,
        treasury: state.treasury,
      },
      null,
      2
    )
  );
}

/** Merge job lists by id — never drop newer jobs when concurrent writers save. */
export function mergeJobUpdates(latest: MarketplaceJob[], updates: MarketplaceJob[]): MarketplaceJob[] {
  const map = new Map(latest.map((j) => [j.id, j]));
  for (const j of updates) map.set(j.id, j);
  return Array.from(map.values());
}

/** Apply auction tick updates without dropping auctions added concurrently. */
export function mergeAuctionUpdates(latest: ReverseAuction[], updates: ReverseAuction[]): ReverseAuction[] {
  const updateMap = new Map(updates.map((a) => [a.id, a]));
  const merged = latest.map((a) => updateMap.get(a.id) ?? a);
  for (const a of updates) {
    if (!latest.some((x) => x.id === a.id)) merged.push(a);
  }
  return merged;
}

/** Read-modify-write marketplace state atomically (reloads before save). */
export function updateMarketplaceState(
  path: string,
  depositAddress: string | undefined,
  fn: (state: MarketplaceState) => MarketplaceState
): MarketplaceState {
  const current = loadMarketplaceState(path, depositAddress);
  const next = fn(current);
  saveMarketplaceState(next, path);
  return next;
}

/** Persist auction-array changes without clobbering jobs/stats from concurrent writers. */
export function saveMergedAuctions(
  path: string,
  depositAddress: string | undefined,
  processedAuctions: ReverseAuction[]
): MarketplaceState {
  const latest = loadMarketplaceState(path, depositAddress);
  const merged = {
    ...latest,
    auctions: mergeAuctionUpdates(latest.auctions, processedAuctions),
  };
  saveMarketplaceState(merged, path);
  return merged;
}

/** Reload-then-merge save — never write jobs/auctions from a stale in-memory snapshot. */
export function patchMarketplaceState(
  path: string,
  depositAddress: string | undefined,
  patch: (latest: MarketplaceState) => Partial<MarketplaceState>
): MarketplaceState {
  const latest = loadMarketplaceState(path, depositAddress);
  const delta = patch(latest);
  const next: MarketplaceState = {
    ...latest,
    ...delta,
    agentStats: { ...latest.agentStats, ...delta.agentStats },
    jobs: delta.jobs ? mergeJobUpdates(latest.jobs, delta.jobs) : latest.jobs,
    auctions: delta.auctions ?? latest.auctions,
    treasury: { ...latest.treasury, ...delta.treasury },
  };
  saveMarketplaceState(next, path);
  return next;
}

export function getAgentCredits(state: MarketplaceState, externalBaseline = 72): AgentCreditScore[] {
  const LOCAL_BASELINE = 76;
  return listMarketplaceAgents().map((agent) => {
    const stats = state.agentStats[agent.id];
    if (!stats || stats.tasksCompleted === 0) {
      if (agent.origin === "external") return externalBaselineCredit(agent, externalBaseline);
      return {
        agentId: agent.id,
        score: LOCAL_BASELINE,
        successRate: 100,
        tasksCompleted: 0,
        revenueUsdc: "0",
        avgEtaSeconds: agent.etaSeconds,
        reliability: 80,
      };
    }
    const avgEta = stats.tasksCompleted > 0 ? Math.round(stats.totalEtaSeconds / stats.tasksCompleted) : agent.etaSeconds;
    const credit = computeCreditScore({ ...stats, avgEtaSeconds: avgEta });
    if (agent.origin === "local" && credit.score < LOCAL_BASELINE && stats.tasksCompleted < 8) {
      return { agentId: agent.id, ...credit, score: LOCAL_BASELINE };
    }
    return { agentId: agent.id, ...credit };
  });
}

export function recordAgentSuccess(
  state: MarketplaceState,
  agentId: string,
  priceUsdc: string,
  etaSeconds: number
): MarketplaceState {
  const prev = state.agentStats[agentId] ?? { ...DEFAULT_STATS };
  const rev = Number(prev.revenueUsdc) + Number(priceUsdc);
  return {
    ...state,
    agentStats: {
      ...state.agentStats,
      [agentId]: {
        tasksCompleted: prev.tasksCompleted + 1,
        tasksSucceeded: prev.tasksSucceeded + 1,
        revenueUsdc: rev.toFixed(6).replace(/\.?0+$/, "") || "0",
        totalEtaSeconds: prev.totalEtaSeconds + etaSeconds,
      },
    },
  };
}

export function recordAgentFailure(state: MarketplaceState, agentId: string): MarketplaceState {
  const prev = state.agentStats[agentId] ?? { ...DEFAULT_STATS };
  const agent = getMarketplaceAgent(agentId);
  return {
    ...state,
    agentStats: {
      ...state.agentStats,
      [agentId]: {
        ...prev,
        tasksCompleted: prev.tasksCompleted + 1,
        totalEtaSeconds: prev.totalEtaSeconds + (agent?.etaSeconds ?? 30),
      },
    },
  };
}

export function treasuryCredit(state: MarketplaceState, amountUsdc: string): MarketplaceState {
  const balance = Number(state.treasury.balanceUsdc) + Number(amountUsdc);
  return {
    ...state,
    treasury: {
      ...state.treasury,
      balanceUsdc: balance.toFixed(6).replace(/\.?0+$/, "") || "0",
    },
  };
}

export function treasurySpend(state: MarketplaceState, amountUsdc: string): MarketplaceState {
  const spent = Number(state.treasury.spentUsdc) + Number(amountUsdc);
  const balance = Math.max(0, Number(state.treasury.balanceUsdc) - Number(amountUsdc));
  return {
    ...state,
    treasury: {
      ...state.treasury,
      balanceUsdc: balance.toFixed(2),
      spentUsdc: spent.toFixed(6).replace(/\.?0+$/, "") || "0",
    },
  };
}
