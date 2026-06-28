/** Set when lite/full marketplace execute routes finish registering. */
let executeRouteCount = 0;
let executeLoadError: string | null = null;

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
} {
  return {
    executeRoutes: executeRouteCount,
    executeLoadError,
    internalAgentPay: process.env.BUTLER_INTERNAL_AGENT_PAY !== "false",
  };
}
