import {
  resolveExecutionShape,
  type ExecutionShapeResult,
  type MarketplaceCategory,
} from "@butler/core";
import { classifyExecutionShapeWithOpenAi } from "./openai-planner.ts";

export async function resolveTaskExecutionShape(
  brief: string,
  context?: { qualityTier?: string; auctionMode?: string; category?: string }
): Promise<ExecutionShapeResult> {
  const heuristic = resolveExecutionShape(brief);
  if (heuristic.confidence !== "low") return heuristic;

  const ai = await classifyExecutionShapeWithOpenAi(brief, context);
  if (!ai) return heuristic;

  return {
    shape: ai.shape,
    confidence: "medium",
    reason: ai.reason || heuristic.reason,
    suggestedAgentId: ai.suggestedAgentId,
    suggestedCategory: ai.suggestedCategory as MarketplaceCategory | undefined,
  };
}
