import type { MarketplaceCategory } from "./marketplace.ts";

export interface ExpressBrief {
  category: MarketplaceCategory;
  agentId: string;
  label: string;
}

/** Multi-agent ETF / full report — all specialists contribute one unified deliverable. */
export function wantsDeepBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  if (isLightLiteratureBrief(brief)) return false;
  if (isSoliditySourceBrief(brief)) return false;
  // Keep audits/bills on their specialist paths unless the user explicitly asks for a deep report.
  if (
    (/\baudit\b|solidity|smart contract/.test(t) || /\bbill\b|subscription|utility invoice/.test(t)) &&
    !/deep dive|full report|comprehensive|multi.?agent|all agents|investment report/.test(t)
  ) {
    return false;
  }
  if (
    /research paper|deep dive|full report|investment report|investment thesis|comprehensive|due diligence|multi.?agent|all agents|in-depth|thorough analysis|extensive (research|analysis|report)|exhaustive|deep research|full analysis/.test(
      t
    )
  ) {
    return true;
  }
  // "Research X and …" / stock & macro style briefs that need more than one specialist
  if (
    /\bresearch\b/.test(t) &&
    /report|stock|equity|thesis|outlook|exposure|analysis|flows?|market impact|on[- ]?chain|defi|investment/.test(t)
  ) {
    return true;
  }
  if (/macro outlook|market impact|fed rates|investment analysis|create an investment/.test(t)) {
    return true;
  }
  return false;
}

/** Short literature executive summary (3 papers/themes) — single Research Agent. */
function isLightLiteratureBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  return (
    (/executive summary/.test(t) || /research summary/.test(t)) &&
    /paper|theme|limitation|academic|literature|industry|hedge/.test(t) &&
    !/research paper|deep dive|full report|comprehensive|due diligence|multi.?agent/.test(t)
  );
}

/** Force full-tier all-specialist Deep Dive ETF (not express / single-agent). */
export function resolveDeepWorkRouting(brief: string): BtcPipelineRouting | null {
  if (wantsDeepBrief(brief)) {
    return { qualityTier: "full", auctionMode: "etf", etfId: "deep-dive-etf" };
  }
  return resolveBtcPipelineRouting(brief);
}

export type BtcPipelineRouting = {
  qualityTier: "standard" | "full";
  auctionMode: "etf";
  etfId?: string;
};

/** BTC on-chain / DeFi research — multi-agent ETF (not a single on-chain specialist). */
export function resolveBtcPipelineRouting(brief: string): BtcPipelineRouting | null {
  const t = brief.toLowerCase();
  if (!/\b(btc|bitcoin)\b/.test(t)) return null;
  if (!/on[- ]?chain|onchain|whale|exchange flow|defi|decentralized finance/.test(t)) return null;
  if (isChartOnlyBrief(brief) || isMarketQuoteBrief(brief)) return null;
  if (wantsDeepBrief(brief)) return { qualityTier: "full", auctionMode: "etf", etfId: "deep-dive-etf" };
  // Explicit thesis / investment report → compact thesis ETF; otherwise full on-chain pipeline.
  if (/investment thesis|investment report|btc thesis|bitcoin thesis/.test(t) && !/defi exposure|on[- ]?chain flows?/.test(t)) {
    return { qualityTier: "standard", auctionMode: "etf", etfId: "btc-full-thesis-etf" };
  }
  return { qualityTier: "standard", auctionMode: "etf", etfId: "btc-onchain-etf" };
}

/** Academic / industry literature review — Research Agent, not ETF or thesis. */
export function isResearchLiteratureBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  if (wantsDeepBrief(brief) || isSoliditySourceBrief(brief)) return false;
  const wantsLiterature =
    /academic|literature review|industry research|key papers?|papers?\/themes|themes and limitations|research on\b|research summary|survey of|state of the art|macro hedge/.test(
      t
    ) ||
    (/executive summary/.test(t) && /research|paper|academic|literature|industry|hedge|theme/.test(t)) ||
    (/research/.test(t) && /paper|theme|limitation|academic|industry|hedge/.test(t));
  return wantsLiterature && !isHeadlineOnlyBrief(brief);
}

/** Headlines-only — News Agent, not ETF. */
export function isHeadlineOnlyBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  const wantsHeadlines =
    /headline|headlines|top\s+\d+.*(news|headline)|crypto news|news from the last|news summary|news feed/.test(t) ||
    (/summarize/.test(t) && /news|headline/.test(t));
  return wantsHeadlines && !wantsDeepBrief(brief);
}

/** Technical analysis — Chart Agent only. */
export function isChartOnlyBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  const wantsChart =
    /technical analysis|technicals\b|chart analysis|\brsi\b|support.*resistance|resistance.*support|short-term bias|trading bias|key support|key resistance/.test(
      t
    ) || (/support|resistance/.test(t) && /\brsi\b|bias|bullish|bearish|neutral|pattern/.test(t));
  return wantsChart && !wantsDeepBrief(brief);
}

/** Live price quote only — Market Agent. */
export function isMarketQuoteBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  const wantsPrice =
    /current price|live price|spot price|price of|quote for|how much is/.test(t) ||
    ((/price|quote/.test(t) || /\b(btc|eth|sol|nvda|aapl|msft|tsla)\b/.test(t)) &&
      !/technical|rsi|support|headline|news|thesis|research|report|sentiment|defi|onchain|on-chain|whale|inflow|outflow|transfer|analysis/.test(t));
  return wantsPrice && !wantsDeepBrief(brief) && !isChartOnlyBrief(brief) && !isOnchainOnlyBrief(brief);
}

/** Sentiment-only — Sentiment Agent. */
export function isSentimentOnlyBrief(brief: string): boolean {
  const t = brief.toLowerCase();
  const wantsSentiment = /sentiment score|sentiment analysis|market mood|social sentiment/.test(t);
  return wantsSentiment && !wantsDeepBrief(brief) && !isChartOnlyBrief(brief);
}

/** Wallet reputation / copy-trade due diligence — Wallet Reputation Agent. */
export function isWalletReputationBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  const hasWallet = /\b0x[a-fA-F0-9]{40}\b/.test(brief);
  return (
    /wallet reputation|scam score|sybil score|whale score|copy trade|copy-trading|wallet risk/.test(t) ||
    (hasWallet && /reputation|scam|sybil|whale|pnl|profit|copy/.test(t))
  );
}

/** Token deep-dive — Token Research Agent. */
export function isTokenResearchBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  return (
    /token research|token analysis|analyze token|tokenomics|unlock schedule|vesting schedule|holder distribution/.test(
      t
    ) ||
    (/analyze\b/.test(t) && /\b(token|coin)\b/.test(t)) ||
    (isHolderInfoBrief(brief) && /distribution|tokenomics|concentration|top\s+holder|supply/.test(t))
  );
}

/** DeFi portfolio risk — Portfolio Risk Agent. */
export function isPortfolioRiskBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  return /liquidation risk|value at risk|\bvar\b|portfolio risk|defi portfolio|collateral risk|hedge suggestion/.test(
    t
  );
}

/** Multi-source crypto news intelligence report. */
export function isCryptoNewsIntelBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  return (
    /news intelligence|market-moving|market moving events|bullish.*bearish|bearish.*bullish/.test(t) ||
    (/crypto news|news report/.test(t) && /sentiment|intelligence|market-moving|sources/.test(t))
  );
}

/** Solidity source pasted in a brief — route to Audit Agent, not on-chain market analysis. */
export function isSoliditySourceBrief(brief: string): boolean {
  return /pragma\s+solidity/i.test(brief) && /contract\s+\w+/i.test(brief);
}

/** Smart contract security audit — Audit Agent only. */
export function isAuditOnlyBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  if (isSoliditySourceBrief(brief)) return true;
  return (
    /\baudit\b|security audit|vulnerabilit|slither|smart contract audit|contract audit|solidity audit|security scan/.test(
      t
    ) && /solidity|smart contract|\bcontract\b|reentrancy|vulnerable|pragma/.test(t)
  );
}

/** Bill / utility quote — Bill Agent only. */
export function isBillOnlyBrief(brief: string): boolean {
  if (wantsDeepBrief(brief)) return false;
  const t = brief.toLowerCase();
  if (isSoliditySourceBrief(brief) || isAuditOnlyBrief(brief)) return false;
  return (
    /utility bill|electricity bill|energy bill|gas bill|water bill|invoice quote|bill quote|monthly bill/.test(t) ||
    (/\bbill\b/.test(t) && /utility|electric|energy|kwh|pg&e|pge|provider|due date/.test(t))
  );
}

/** Holder concentration / distribution — Token Research or On-Chain Agent, not news. */
export function isHolderInfoBrief(brief: string): boolean {
  if (wantsDeepBrief(brief) || isHeadlineOnlyBrief(brief)) return false;
  const t = brief.toLowerCase();
  const wantsHolders =
    /\bholders?\b/.test(t) &&
    (/information|info|data|stats|statistics|distribution|concentration|top\s+holders?|holder\s+count|holder\s+supply|who\s+holds/.test(
      t
    ) ||
      (/\b(btc|eth|sol|bitcoin|ethereum|solana|token|coin)\b/.test(t) && /holder/.test(t)));
  return wantsHolders && !/news|headline|comprehensive|full report|thesis|multi.?agent|market-moving/.test(t);
}

export type ExecutionShape = "single" | "multi";

export interface ExecutionShapeResult {
  shape: ExecutionShape;
  confidence: "high" | "medium" | "low";
  reason: string;
  suggestedAgentId?: string;
  suggestedCategory?: MarketplaceCategory;
}

/** Decide single specialist vs multi-agent before auction/planning. */
export function resolveExecutionShape(brief: string): ExecutionShapeResult {
  if (wantsDeepBrief(brief)) {
    return {
      shape: "multi",
      confidence: "high",
      reason: "Comprehensive or multi-agent report requested",
    };
  }

  const btcPipeline = resolveBtcPipelineRouting(brief);
  if (btcPipeline) {
    return {
      shape: "multi",
      confidence: "high",
      reason:
        btcPipeline.etfId === "btc-full-thesis-etf"
          ? "BTC investment thesis pipeline"
          : "BTC on-chain + DeFi multi-agent pipeline",
    };
  }

  const express = resolveExpressBrief(brief);
  if (express) {
    return {
      shape: "single",
      confidence: "high",
      reason: `Specialist task — ${express.label}`,
      suggestedAgentId: express.agentId,
      suggestedCategory: express.category,
    };
  }

  const t = brief.toLowerCase();
  if (/headline|headlines|news/.test(t) && /price|quote|market/.test(t)) {
    return { shape: "multi", confidence: "high", reason: "Combined news and market price workflow" };
  }
  if (/full report|comprehensive|investment report|multi.?agent|all agents|due diligence/.test(t)) {
    return { shape: "multi", confidence: "high", reason: "Explicit multi-agent deliverable" };
  }
  if (/defi/.test(t) && /wallet|reputation|token research|due diligence|portfolio risk/.test(t)) {
    return { shape: "multi", confidence: "medium", reason: "DeFi due diligence spans multiple specialists" };
  }
  if (/news|headline/.test(t) && !/research|thesis|report|onchain|on-chain|holder/.test(t)) {
    return {
      shape: "single",
      confidence: "medium",
      reason: "News-focused brief",
      suggestedAgentId: "news-agent",
      suggestedCategory: "news",
    };
  }
  if (/onchain|on-chain|whale|holder|exchange flow|network activity/.test(t)) {
    if (/\bdefi\b|decentralized finance|defi exposure/.test(t)) {
      return {
        shape: "multi",
        confidence: "high",
        reason: "On-chain flows with DeFi exposure",
      };
    }
    return {
      shape: "single",
      confidence: "medium",
      reason: "On-chain or holder activity brief",
      suggestedAgentId: "onchain-agent",
      suggestedCategory: "market-data",
    };
  }

  return {
    shape: "single",
    confidence: "low",
    reason: "Defaulting to single-agent reverse auction",
  };
}

/** On-chain / whale activity — On-Chain Agent only. */
export function isOnchainOnlyBrief(brief: string): boolean {
  if (isAuditOnlyBrief(brief) || isSoliditySourceBrief(brief)) return false;
  const t = brief.toLowerCase();
  const wantsOnchain =
    /on[- ]?chain\s+activit|onchain\s+activit|on[- ]?chain\s+data|on[- ]?chain\s+analysis/.test(t) ||
    /on[- ]?chain|whale|exchange inflow|exchange outflow|exchange flows?|large transfers?|holder trends?|network activity/.test(
      t
    ) ||
    (isHolderInfoBrief(brief) && /activit|flow|transfer|whale|exchange/.test(t)) ||
    ((/inflow|outflow/.test(t) || /\btransfer(s)?\b/.test(t)) &&
      /\b(exchange|btc|bitcoin|eth|ethereum|solana|crypto|whale)\b/.test(t) &&
      !/pragma\s+solidity|smart contract/.test(t));
  const alsoWantsDefi = /\bdefi\b|decentralized finance|defi exposure/.test(t);
  return wantsOnchain && !alsoWantsDefi && !wantsDeepBrief(brief) && !isChartOnlyBrief(brief);
}

/** Route simple tasks to one cheap agent (brief tier, skip ETF). */
export function resolveExpressBrief(brief: string): ExpressBrief | null {
  if (isAuditOnlyBrief(brief)) {
    return { category: "audit", agentId: "audit-agent", label: "contract audit" };
  }
  if (isBillOnlyBrief(brief)) {
    return { category: "bills", agentId: "bill-agent", label: "utility bill quote" };
  }
  if (isWalletReputationBrief(brief)) {
    return { category: "market-data", agentId: "wallet-reputation-agent", label: "wallet reputation" };
  }
  if (isTokenResearchBrief(brief)) {
    return { category: "research", agentId: "token-research-agent", label: "token research" };
  }
  if (isHolderInfoBrief(brief)) {
    return { category: "market-data", agentId: "onchain-agent", label: "holder / on-chain data" };
  }
  if (isPortfolioRiskBrief(brief)) {
    return { category: "reporting", agentId: "portfolio-risk-agent", label: "portfolio risk" };
  }
  if (isCryptoNewsIntelBrief(brief)) {
    return { category: "news", agentId: "crypto-news-intelligence-agent", label: "news intelligence" };
  }
  if (isHeadlineOnlyBrief(brief)) {
    return { category: "news", agentId: "news-agent", label: "headlines" };
  }
  if (isResearchLiteratureBrief(brief)) {
    return { category: "research", agentId: "research-agent", label: "research literature" };
  }
  if (isChartOnlyBrief(brief)) {
    return { category: "market-data", agentId: "chart-agent", label: "technical analysis" };
  }
  if (isOnchainOnlyBrief(brief)) {
    return { category: "market-data", agentId: "onchain-agent", label: "on-chain analysis" };
  }
  if (isMarketQuoteBrief(brief)) {
    return { category: "market-data", agentId: "market-agent", label: "market quote" };
  }
  if (isSentimentOnlyBrief(brief)) {
    return { category: "sentiment", agentId: "sentiment-agent", label: "sentiment" };
  }
  return null;
}
