import {
  buildQuoteForAgent,
  clearEphemeralAgents,
  defaultAuctionMode,
  getAgentCredits,
  initializeAuction,
  listMarketplaceAgents,
  loadMarketplaceState,
  pickAuctionWinner,
  processAuctionTick,
  resolveAgentServiceUrl,
  resolveTaskCategory,
  saveMergedAuctions,
  solicitCatalogBids,
  updateMarketplaceState,
  type AgentCreditScore,
  type AuctionMode,
  type MarketplaceCategory,
  type QualityTier,
  type ReverseAuction,
} from "@butler/core";
import { agentRunReadiness } from "./agent-runner.ts";
import { executeAuctionAward } from "./auction-engine.ts";
import { planTaskForRun, runMarketplaceTask, buildJobSummary } from "./marketplace-task.ts";
import {
  discoverOpenAgents,
  getExternalAgentPolicy,
  loadExternalAgentRegistry,
} from "./external-agent-registry.ts";
import { probeX402Url } from "./x402-probe.ts";

export { inferAuctionCategory, resolveTaskCategory } from "@butler/core";

export type PayerAgentStrategy = "auction" | "direct";

export interface PayerAgentQuote {
  agentId: string;
  agentName: string;
  priceUsdc: string;
  reputation: number;
  etaSeconds: number;
  origin?: "local" | "external";
  serviceUrl?: string;
  x402Verified?: boolean;
}

export interface PayerAgentPhase {
  phase: "discover" | "negotiate" | "settle";
  at: number;
  message: string;
  quotes?: PayerAgentQuote[];
  auctionId?: string;
  bids?: number;
  winner?: { agentId: string; agentName: string; priceUsdc: string };
  settlementId?: string;
  ok?: boolean;
  error?: string;
}

export interface PayerAgentResult {
  ok: boolean;
  strategy: PayerAgentStrategy;
  mode?: "x402" | "circle-cli";
  brief: string;
  category: MarketplaceCategory;
  phases: PayerAgentPhase[];
  auction?: ReverseAuction;
  jobId?: string;
  summary?: string;
  error?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function settlementTimeoutMs(qualityTier: QualityTier): number {
  if (qualityTier === "full") return 2 * 60_000;
  if (qualityTier === "brief") return 90_000;
  return 3 * 60_000;
}

function discoverQuotes(
  brief: string,
  category: MarketplaceCategory,
  credits: AgentCreditScore[],
  minReputation: number,
  apiBase: string,
  opts?: { qualityTier?: QualityTier; maxBudgetUsdc?: string; auctionMode?: AuctionMode }
): PayerAgentQuote[] {
  const now = Math.floor(Date.now() / 1000);
  const stub: ReverseAuction = {
    id: "discover",
    at: now,
    status: "open",
    brief,
    category,
    minReputation,
    deadlineAt: now + 60,
    bids: [],
    qualityTier: opts?.qualityTier,
    maxBudgetUsdc: opts?.maxBudgetUsdc,
    auctionMode: opts?.auctionMode,
  };
  const bids = solicitCatalogBids(stub, credits, 1);
  const creditMap = new Map(credits.map((c) => [c.agentId, c]));

  return bids.map((b) => {
    const agent = listMarketplaceAgents().find((a) => a.id === b.agentId);
    const credit = creditMap.get(b.agentId);
    const quote = agent && credit ? buildQuoteForAgent(agent, credit, apiBase) : null;
    return {
      agentId: b.agentId,
      agentName: b.agentName,
      priceUsdc: b.priceUsdc,
      reputation: credit?.score ?? 0,
      etaSeconds: quote?.etaSeconds ?? agent?.etaSeconds ?? 0,
      origin: agent?.origin,
      serviceUrl: agent ? resolveAgentServiceUrl(agent, apiBase) : undefined,
      x402Verified: agent?.x402Verified,
    };
  });
}

async function refreshExternalPrices(apiBase: string): Promise<void> {
  const externals = listMarketplaceAgents().filter((a) => a.origin === "external" && a.serviceUrl);
  for (const agent of externals) {
    const probe = await probeX402Url(agent.serviceUrl!);
    if (probe.ok && probe.priceUsdc) {
      agent.priceUsdc = probe.priceUsdc;
      agent.x402Verified = true;
      agent.probedAt = probe.probedAt;
      agent.network = probe.network;
    }
  }
  void apiBase;
}

async function pollAuctionUntilSettled(opts: {
  statePath: string;
  sellerAddress: string;
  auctionId: string;
  timeoutMs: number;
}): Promise<ReverseAuction> {
  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    const mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
    const auction = mp.auctions.find((a) => a.id === opts.auctionId);
    if (!auction) throw new Error("Auction not found during settlement");
    if (auction.status === "completed" || auction.status === "cancelled" || auction.status === "open") {
      return auction;
    }
    await sleep(2_000);
  }
  const mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
  const auction = mp.auctions.find((a) => a.id === opts.auctionId);
  if (!auction) throw new Error("Auction not found");
  return auction;
}

async function waitForAuctionAward(opts: {
  statePath: string;
  sellerAddress: string;
  auctionId: string;
  ttlSeconds: number;
  baselineReputation?: number;
}): Promise<{ auction: ReverseAuction; needsAward: boolean }> {
  const deadline = Date.now() + (opts.ttlSeconds + 20) * 1000;
  let missingRetries = 0;

  while (Date.now() < deadline) {
    const mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
    const idx = mp.auctions.findIndex((a) => a.id === opts.auctionId);
    if (idx < 0) {
      if (missingRetries++ < 5) {
        await sleep(400);
        continue;
      }
      throw new Error("Auction not found during negotiation");
    }
    missingRetries = 0;

    const auction = mp.auctions[idx]!;
    if (auction.status === "completed") {
      return { auction, needsAward: false };
    }
    if (auction.status === "awarded" || auction.status === "cancelled") {
      return { auction, needsAward: false };
    }

    const credits = getAgentCredits(mp, opts.baselineReputation ?? 72);
    const tick = processAuctionTick(auction, credits);
    if (tick.auction !== auction) {
      saveMergedAuctions(opts.statePath, opts.sellerAddress, mp.auctions.map((a, i) => (i === idx ? tick.auction : a)));
    }

    if (tick.needsAward) {
      return { auction: tick.auction, needsAward: true };
    }
    if (tick.auction.status !== "open") {
      return { auction: tick.auction, needsAward: false };
    }

    await sleep(2_000);
  }

  const mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
  const auction = mp.auctions.find((a) => a.id === opts.auctionId);
  if (!auction) throw new Error("Auction not found");
  if (auction.status === "completed") return { auction, needsAward: false };
  return { auction, needsAward: auction.status === "open" && auction.bids.length > 0 };
}

export async function runPayerAgent(opts: {
  brief: string;
  apiBase: string;
  statePath: string;
  sellerAddress: string;
  strategy?: PayerAgentStrategy;
  category?: MarketplaceCategory;
  minReputation?: number;
  ttlSeconds?: number;
  qualityTier?: QualityTier;
  maxBudgetUsdc?: string;
  auctionMode?: AuctionMode;
  forceX402?: boolean;
}): Promise<PayerAgentResult> {
  const brief = opts.brief.trim();
  if (!brief) {
    return { ok: false, strategy: opts.strategy ?? "auction", brief: "", category: "research", phases: [], error: "brief required" };
  }

  const qualityTier = opts.qualityTier ?? "standard";
  const category = resolveTaskCategory(brief, opts.category, qualityTier);
  const auctionMode = defaultAuctionMode(qualityTier, opts.auctionMode);
  const maxBudgetUsdc = opts.maxBudgetUsdc?.trim() || undefined;

  const readiness = agentRunReadiness();
  if (!readiness.canRun) {
    return {
      ok: false,
      strategy: opts.strategy ?? "auction",
      brief,
      category,
      phases: [],
      error: readiness.reason ?? "Payer not configured",
    };
  }

  const strategy = opts.strategy ?? "auction";
  const minReputation = opts.minReputation ?? 70;
  const ttlSeconds = opts.ttlSeconds ?? 60;
  const phases: PayerAgentPhase[] = [];
  const now = () => Math.floor(Date.now() / 1000);
  const policy = getExternalAgentPolicy();

  try {
  loadExternalAgentRegistry();

  const discoveryUrls = (process.env.BUTLER_DISCOVERY_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  if (discoveryUrls.length > 0 && policy.openDiscovery) {
    const ephemeral = await discoverOpenAgents(discoveryUrls, { ephemeral: true });
    if (ephemeral.length > 0) {
      phases.push({
        phase: "discover",
        at: now(),
        message: `Open internet: probed ${discoveryUrls.length} URLs, ${ephemeral.length} x402 agents verified`,
        quotes: ephemeral.map((a) => ({
          agentId: a.id,
          agentName: a.name,
          priceUsdc: a.priceUsdc,
          reputation: policy.baselineReputation,
          etaSeconds: a.etaSeconds,
          origin: "external",
          serviceUrl: a.serviceUrl,
          x402Verified: true,
        })),
      });
    }
  }

  await refreshExternalPrices(opts.apiBase);

  let mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
  const credits = getAgentCredits(mp, policy.baselineReputation);

  const quotes = discoverQuotes(brief, category, credits, minReputation, opts.apiBase, {
    qualityTier,
    maxBudgetUsdc,
    auctionMode,
  });
  phases.push({
    phase: "discover",
    at: now(),
    message:
      auctionMode === "etf"
        ? `Catalog: ${quotes.length} ETF pipeline(s) for ${category} (${listMarketplaceAgents().filter((a) => a.origin === "external").length} external)`
        : `Catalog: ${quotes.length} agents eligible for ${category} (${listMarketplaceAgents().filter((a) => a.origin === "external").length} external)`,
    quotes,
  });

  if (strategy === "direct") {
    const plan = await planTaskForRun({ task: brief, mode: "auto", credits });
    phases.push({
      phase: "negotiate",
      at: now(),
      message: plan.reason,
      winner: plan.agentIds[0]
        ? {
            agentId: plan.agentIds[0],
            agentName: listMarketplaceAgents().find((a) => a.id === plan.agentIds[0])?.name ?? plan.agentIds[0],
            priceUsdc: plan.estimatedUsdc,
          }
        : undefined,
    });

    try {
      const result = await runMarketplaceTask({
        apiBase: opts.apiBase,
        task: brief,
        mode: "auto",
        forceX402: opts.forceX402,
        credits,
      });
      const steps = result.orchestration?.steps ?? [];
      const settled = steps.length > 0 && steps.every((s) => s?.ok);
      const settlementId = steps.find((s) => s?.settlementId)?.settlementId;
      const failedStep = steps.find((s) => s && !s.ok);
      phases.push({
        phase: "settle",
        at: now(),
        message: settled ? "x402 payment settled" : "Payment failed",
        settlementId,
        ok: settled,
        error: settled ? undefined : failedStep?.error,
      });

      return {
        ok: settled,
        strategy: "direct",
        mode: result.orchestration?.mode,
        brief,
        category,
        phases,
        jobId: result.job.id,
        summary: result.summary,
        error: settled ? undefined : phases[phases.length - 1]?.error,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Direct settlement failed";
      phases.push({ phase: "settle", at: now(), message, ok: false, error: message });
      return { ok: false, strategy: "direct", brief, category, phases, error: message };
    }
  }

  const auction = initializeAuction({
    brief,
    category,
    minReputation,
    ttlSeconds,
    autoAward: true,
    bidIntervalSeconds: 10,
    payerAgentOwned: true,
    qualityTier,
    maxBudgetUsdc,
    auctionMode,
    credits,
  });
  mp = updateMarketplaceState(opts.statePath, opts.sellerAddress, (state) => ({
    ...state,
    auctions: [...state.auctions, auction],
  }));

  phases.push({
    phase: "negotiate",
    at: now(),
    message:
      auctionMode === "etf"
        ? `ETF auction — ${auction.bids.length} pipeline(s), ${qualityTier} tier, ${ttlSeconds}s deadline`
        : `Auction open — ${auction.bids.length} opening bids (${qualityTier} tier), ${ttlSeconds}s deadline`,
    auctionId: auction.id,
    bids: auction.bids.length,
  });

  let { auction: finalAuction } = await waitForAuctionAward({
    statePath: opts.statePath,
    sellerAddress: opts.sellerAddress,
    auctionId: auction.id,
    ttlSeconds,
    baselineReputation: policy.baselineReputation,
  });

  if (finalAuction.status === "awarded") {
    finalAuction = await pollAuctionUntilSettled({
      statePath: opts.statePath,
      sellerAddress: opts.sellerAddress,
      auctionId: auction.id,
      timeoutMs: settlementTimeoutMs(qualityTier),
    });
  }

  const creditMap = new Map(credits.map((c) => [c.agentId, c]));
  const leader = pickAuctionWinner(finalAuction, creditMap);

  if (finalAuction.status === "completed" && finalAuction.jobId) {
    mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
    const job = mp.jobs.find((j) => j.id === finalAuction.jobId);
    phases.push({
      phase: "negotiate",
      at: now(),
      message: "Auction settled by marketplace engine",
      auctionId: finalAuction.id,
      bids: finalAuction.bids.length,
      winner: leader
        ? { agentId: leader.agentId, agentName: leader.agentName, priceUsdc: leader.priceUsdc }
        : undefined,
    });
    phases.push({
      phase: "settle",
      at: now(),
      message: "x402 payment settled — deliverable received",
      settlementId: job?.steps.find((s) => s.settlementId)?.settlementId,
      ok: true,
      winner: leader
        ? { agentId: leader.agentId, agentName: leader.agentName, priceUsdc: leader.priceUsdc }
        : undefined,
    });
    return {
      ok: true,
      strategy: "auction",
      brief,
      category,
      phases,
      auction: finalAuction,
      jobId: job?.id,
      summary: job ? buildJobSummary(job) : undefined,
    };
  }

  phases.push({
    phase: "negotiate",
    at: now(),
    message: `Negotiation complete — ${finalAuction.bids.length} bids after ${finalAuction.bidRound ?? 0} rounds`,
    auctionId: finalAuction.id,
    bids: finalAuction.bids.length,
    winner: leader
      ? { agentId: leader.agentId, agentName: leader.agentName, priceUsdc: leader.priceUsdc }
      : undefined,
  });

  if (!leader) {
    const err =
      finalAuction.bids.length === 0
        ? maxBudgetUsdc
          ? `No bids received within $${maxBudgetUsdc} budget`
          : "No bids received"
        : maxBudgetUsdc
          ? `No eligible winner within $${maxBudgetUsdc} budget (min reputation ${minReputation})`
          : `No eligible winner (min reputation ${minReputation})`;
    phases.push({ phase: "settle", at: now(), message: err, ok: false, error: err });
    return { ok: false, strategy: "auction", brief, category, phases, auction: finalAuction, error: err };
  }

  if (finalAuction.status === "cancelled") {
    const mpSnap = loadMarketplaceState(opts.statePath, opts.sellerAddress);
    const priorJob = finalAuction.jobId ? mpSnap.jobs.find((j) => j.id === finalAuction.jobId) : undefined;
    const priorError =
      priorJob?.steps.find((s) => s.error)?.error ??
      finalAuction.events?.filter((e) => e.kind === "cancelled").at(-1)?.message ??
      "Prior settlement failed";
    phases.push({
      phase: "settle",
      at: now(),
      message: `Retrying settlement after: ${priorError}`,
    });
  }

  const award =
    finalAuction.status === "completed"
      ? { ok: true as const }
      : ((await executeAuctionAward({
          statePath: opts.statePath,
          sellerAddress: opts.sellerAddress,
          apiBase: opts.apiBase,
          auctionId: auction.id,
          forceX402: opts.forceX402,
        })) ?? { ok: false, error: "Settlement returned no result" });

  mp = loadMarketplaceState(opts.statePath, opts.sellerAddress);
  const completed = mp.auctions.find((a) => a.id === auction.id);
  const job = completed?.jobId ? mp.jobs.find((j) => j.id === completed.jobId) : undefined;
  const settlementId = job?.steps.find((s) => s.settlementId)?.settlementId;

  phases.push({
    phase: "settle",
    at: now(),
    message: award.ok ? "x402 payment settled — deliverable received" : (award.error ?? "Settlement failed"),
    settlementId,
    ok: award.ok,
    error: award.error,
    winner: leader
      ? { agentId: leader.agentId, agentName: leader.agentName, priceUsdc: leader.priceUsdc }
      : undefined,
  });

  const summary = job ? buildJobSummary(job) : undefined;
  const partialSummary =
    summary ??
    (job && job.steps.some((s) => s.status === "done")
      ? buildJobSummary({ ...job, status: "failed" })
      : undefined);

  return {
    ok: award.ok,
    strategy: "auction",
    brief,
    category,
    phases,
    auction: completed ?? finalAuction,
    jobId: job?.id,
    summary: partialSummary,
    error: award.ok ? undefined : award.error,
  };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payer agent failed";
    phases.push({ phase: "settle", at: now(), message, ok: false, error: message });
    return {
      ok: false,
      strategy,
      brief,
      category,
      phases,
      error: message,
    };
  } finally {
    clearEphemeralAgents();
  }
}
