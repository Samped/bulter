/** Pure guards for intel deliverables — kept separate so Library never depends on a free global. */

export function isWalletReputationPayload(data: Record<string, unknown>): boolean {
  return data.type === "wallet-reputation" || typeof data.scamScore === "number";
}

export function isTokenResearchPayload(data: Record<string, unknown>): boolean {
  return (
    data.type === "token-research" ||
    typeof data.token === "string" ||
    typeof data.tokenSymbol === "string"
  );
}

export function isCryptoNewsPayload(data: Record<string, unknown>): boolean {
  return data.type === "crypto-news-intelligence" || Array.isArray(data.marketMovingEvents);
}

export function isPortfolioRiskPayload(data: Record<string, unknown>): boolean {
  return data.type === "portfolio-risk" || typeof data.portfolioRiskScore === "number";
}

export function isIntelPayload(data: Record<string, unknown>): boolean {
  return (
    isWalletReputationPayload(data) ||
    isTokenResearchPayload(data) ||
    isCryptoNewsPayload(data) ||
    isPortfolioRiskPayload(data)
  );
}
