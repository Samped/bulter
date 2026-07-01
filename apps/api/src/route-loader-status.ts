/** Set when lite/full marketplace execute routes finish registering. */
let executeRouteCount = 0;
let executeLoadError: string | null = null;
let bootPhase = "pending";

/** Bump when ledger backfill logic changes — check via GET /api/health ledgerVersion. */
export const LEDGER_BACKFILL_VERSION = 2;

export function setBootPhase(phase: string): void {
  bootPhase = phase;
}

export function setExecuteRouteCount(n: number): void {
  executeRouteCount = n;
}

export function setExecuteLoadError(message: string | null): void {
  executeLoadError = message;
}

export function getRouteLoaderStatus(): {
  executeRoutes: number;
  executeLoadError: string | null;
  internalAgentPay: boolean;
  bootPhase: string;
} {
  return {
    executeRoutes: executeRouteCount,
    executeLoadError,
    internalAgentPay: process.env.BUTLER_INTERNAL_AGENT_PAY !== "false",
    bootPhase,
  };
}
