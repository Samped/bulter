import {
  resolveExecutionShape,
  type ExecutionShapeResult,
  type MarketplaceCategory,
} from "@butler/core";
import { classifyExecutionShapeRemote } from "./brief-router.ts";

export async function resolveTaskExecutionShape(
  brief: string,
  context?: { qualityTier?: string; auctionMode?: string; category?: string }
): Promise<ExecutionShapeResult> {
  const local = resolveExecutionShape(brief);
  if (local.confidence !== "low") return local;

  const remote = await classifyExecutionShapeRemote(brief, context);
  if (!remote) return local;

  return {
    shape: remote.shape,
    confidence: "medium",
    reason: remote.reason || local.reason,
    suggestedAgentId: remote.suggestedAgentId,
    suggestedCategory: remote.suggestedCategory as MarketplaceCategory | undefined,
  };
}
