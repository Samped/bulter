import type { Express, Request, Response } from "express";
import {
  buildCatalogBid,
  defaultAuctionMode,
  getAgentCredits,
  getMarketplaceAgent,
  initializeAuction,
  loadMarketplaceState,
  mergeAuctionBids,
  mergeAuctionUpdates,
  mergeJobUpdates,
  resolveTaskCategory,
  saveMarketplaceState,
  validateCustomBid,
  type QualityTier,
  type ReverseAuction,
} from "@butler/core";
import {
  executeAuctionAward,
  loadProcessedAuctions,
  startAuctionEngine,
} from "./auction-engine.ts";
import {
  auctionVisibleToOwner,
  filterAuctionsForOwner,
  resolveJobOwnerFromRequest,
  stampAuctionOwner,
} from "./job-owner.ts";
import { runWithUserSession } from "./user-session.ts";

export type AuctionRoutesOpts = {
  app: Express;
  statePath: string;
  sellerAddress: string;
  apiBase: string;
};

export function registerAuctionRoutes(opts: AuctionRoutesOpts): () => void {
  const { app, statePath, sellerAddress, apiBase } = opts;

  function loadMp() {
    return loadMarketplaceState(statePath, sellerAddress);
  }

  function saveMp(state: ReturnType<typeof loadMp>) {
    const latest = loadMp();
    const next = {
      ...latest,
      agentStats: { ...latest.agentStats, ...state.agentStats },
      treasury: { ...latest.treasury, ...state.treasury },
      jobs: mergeJobUpdates(latest.jobs, state.jobs),
      auctions: mergeAuctionUpdates(latest.auctions, state.auctions),
    };
    saveMarketplaceState(next, statePath);
    return next;
  }

  function mpCredits() {
    return getAgentCredits(loadMp());
  }

  async function awardAuction(auctionId: string, forceX402?: boolean) {
    const mp = loadMp();
    const auction = mp.auctions.find((a) => a.id === auctionId);
    const run = () =>
      executeAuctionAward({
        statePath,
        sellerAddress,
        apiBase,
        auctionId,
        forceX402,
      });
    if (auction?.ownerSessionId) {
      return runWithUserSession(auction.ownerSessionId, run);
    }
    return run();
  }

  app.get("/api/marketplace/auctions", (req, res) => {
    const owner = resolveJobOwnerFromRequest(req);
    const { auctions, toAward } = loadProcessedAuctions(statePath, sellerAddress);
    for (const id of toAward) {
      void awardAuction(id);
    }
    res.json(filterAuctionsForOwner(auctions, owner));
  });

  app.get("/api/marketplace/auctions/:id", (req, res) => {
    const owner = resolveJobOwnerFromRequest(req);
    const { auctions } = loadProcessedAuctions(statePath, sellerAddress);
    const auction = filterAuctionsForOwner(auctions, owner).find((a) => a.id === req.params.id);
    if (!auction) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    res.json(auction);
  });

  app.post("/api/marketplace/auctions", (req, res) => {
    const brief = String(req.body?.brief ?? "").trim();
    if (!brief) {
      res.status(400).json({ error: "brief required" });
      return;
    }
    const owner = resolveJobOwnerFromRequest(req);
    if (!owner.sessionId) {
      res.status(401).json({ error: "Missing browser session — refresh the dashboard and log in with Circle." });
      return;
    }
    let mp = loadMp();
    const qualityTier = (req.body?.qualityTier ?? "standard") as QualityTier;
    const maxBudgetUsdc = req.body?.maxBudgetUsdc != null ? String(req.body.maxBudgetUsdc).trim() : undefined;
    const auctionMode = defaultAuctionMode(
      qualityTier,
      req.body?.auctionMode === "etf" ? "etf" : req.body?.auctionMode === "single" ? "single" : undefined
    );
    const userCategory = req.body?.category as ReverseAuction["category"] | undefined;
    const auction = stampAuctionOwner(
      initializeAuction({
        brief,
        category: resolveTaskCategory(brief, userCategory, qualityTier),
        minReputation: Number(req.body?.minReputation ?? 70),
        ttlSeconds: Number(req.body?.ttlSeconds ?? 90),
        autoAward: req.body?.autoAward !== false,
        bidIntervalSeconds: Number(req.body?.bidIntervalSeconds ?? 12),
        qualityTier,
        maxBudgetUsdc: maxBudgetUsdc || undefined,
        auctionMode,
        credits: mpCredits(),
      }),
      owner
    );
    mp = { ...mp, auctions: [...mp.auctions, auction] };
    saveMp(mp);
    res.status(201).json(auction);
  });

  app.post("/api/marketplace/auctions/:id/solicit", (req, res) => {
    const owner = resolveJobOwnerFromRequest(req);
    const { auctions } = loadProcessedAuctions(statePath, sellerAddress);
    const auction = filterAuctionsForOwner(auctions, owner).find((a) => a.id === req.params.id);
    if (!auction) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    res.json(auction);
  });

  app.post("/api/marketplace/auctions/:id/bids", (req, res) => {
    const agentId = String(req.body?.agentId ?? "").trim();
    const priceUsdc = String(req.body?.priceUsdc ?? "").trim();
    if (!agentId) {
      res.status(400).json({ error: "agentId required" });
      return;
    }

    let mp = loadMp();
    const auction = mp.auctions.find((a) => a.id === req.params.id);
    if (!auction) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    if (auction.status !== "open") {
      res.status(400).json({ error: "Auction is not open" });
      return;
    }
    if (Math.floor(Date.now() / 1000) > auction.deadlineAt) {
      res.status(400).json({ error: "Auction deadline passed" });
      return;
    }

    const agent = getMarketplaceAgent(agentId);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const credits = new Map(mpCredits().map((c) => [c.agentId, c]));
    const score = credits.get(agentId)?.score ?? 0;
    if (score < auction.minReputation) {
      res.status(403).json({ error: `Agent reputation ${score} below minimum ${auction.minReputation}` });
      return;
    }

    const bidPrice = priceUsdc || agent.priceUsdc;
    const check = validateCustomBid(agentId, bidPrice);
    if (!check?.ok) {
      res.status(400).json({ error: check?.error ?? "Invalid bid" });
      return;
    }
    if (auction.maxBudgetUsdc && Number(bidPrice) > Number(auction.maxBudgetUsdc) + 1e-9) {
      res.status(400).json({ error: `Bid exceeds max budget ($${auction.maxBudgetUsdc})` });
      return;
    }

    const base = buildCatalogBid(agentId, credits);
    if (!base) {
      res.status(500).json({ error: "Could not build bid" });
      return;
    }

    const bid = { ...base, priceUsdc: bidPrice, at: Math.floor(Date.now() / 1000) };
    const updated = {
      ...auction,
      bids: mergeAuctionBids(auction.bids, [bid]),
    };
    mp = { ...mp, auctions: mp.auctions.map((a) => (a.id === auction.id ? updated : a)) };
    saveMp(mp);
    res.status(201).json(updated);
  });

  app.post("/api/marketplace/auctions/:id/award", async (req, res) => {
    const owner = resolveJobOwnerFromRequest(req);
    const mp = loadMp();
    const auction = mp.auctions.find((a) => a.id === req.params.id);
    if (!auction || !auctionVisibleToOwner(auction, owner)) {
      res.status(404).json({ error: "Auction not found" });
      return;
    }
    try {
      const result = await awardAuction(req.params.id, !!req.body?.forceX402);
      if (!result?.ok) {
        res.status(400).json({ error: result?.error ?? "Award failed" });
        return;
      }
      const { auctions } = loadProcessedAuctions(statePath, sellerAddress);
      const updated = filterAuctionsForOwner(auctions, owner).find((a) => a.id === req.params.id);
      res.json({ ok: true, auction: updated });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Award failed" });
    }
  });

  return startAuctionEngine({ statePath, sellerAddress, apiBase });
}
