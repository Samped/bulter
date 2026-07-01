import type { MarketplaceDeliverable } from "../api.ts";
import { combineWorkflowResult } from "./combine.ts";
import { unwrapAgentPayload } from "./format.ts";

export function parseJsonRecord(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t.startsWith("{")) return null;
    try {
      const parsed = JSON.parse(t) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/** Normalize step output, JSON strings, or x402 `{ data }` wrappers. */
export function parseDeliverablePayload(raw: unknown): Record<string, unknown> | null {
  const obj = parseJsonRecord(raw);
  if (!obj) return null;
  return unwrapAgentPayload(obj) ?? obj;
}

/** Best structured payload for a library job (steps → result → JSON summary). */
export function resolveDeliverablePayload(job: MarketplaceDeliverable | null): Record<string, unknown> | null {
  if (!job) return null;

  const done = job.steps.filter((s) => s.status === "done" && s.output != null);
  if (done.length > 0) {
    const normalized = done.map((s) => ({ output: parseDeliverablePayload(s.output) ?? s.output }));
    const merged = combineWorkflowResult(normalized);
    if (merged) return merged;
    for (const step of done) {
      const row = parseDeliverablePayload(step.output);
      if (row) return row;
    }
  }

  const result = (job as MarketplaceDeliverable & { result?: unknown }).result;
  if (result != null) {
    const fromResult = parseDeliverablePayload(result);
    if (fromResult) return fromResult;
  }

  const summary = job.summary?.trim();
  if (summary?.startsWith("{")) {
    return parseDeliverablePayload(summary);
  }

  return null;
}
