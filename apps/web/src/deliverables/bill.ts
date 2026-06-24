import type { MarketplaceDeliverable } from "../api.ts";
import { unwrapAgentPayload } from "./format.ts";

export function isUtilityBillPayload(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (data.type === "utility-bill") return true;
  return typeof data.provider === "string" && data.amountDue != null && !Array.isArray(data.findings);
}

export function isBillDeliverable(job: Pick<MarketplaceDeliverable, "brief" | "plan" | "steps">): boolean {
  if (job.steps.some((s) => s.agentId === "bill-agent")) return true;
  if (/bill agent|utility bill|bill quote/i.test(job.plan?.reason ?? "")) return true;
  if (/\b(utility|electricity|energy)\s+bill\b/i.test(job.brief ?? "")) return true;
  for (const step of job.steps) {
    const data = unwrapAgentPayload(step.output);
    if (isUtilityBillPayload(data)) return true;
  }
  return false;
}

export function billPaperTitle(
  job: Pick<MarketplaceDeliverable, "brief">,
  payload?: Record<string, unknown> | null
): string {
  const provider = typeof payload?.provider === "string" ? payload.provider.trim() : "";
  if (provider) return `${provider} — Utility Quote`;
  const brief = job.brief?.trim();
  if (brief) {
    const short = brief.length > 56 ? `${brief.slice(0, 56)}…` : brief;
    return short;
  }
  return "Utility Bill Quote";
}

export function formatBillCurrency(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function formatBillDueDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function billRequestText(jobBrief?: string, payload?: Record<string, unknown> | null): string | null {
  const fromJob = jobBrief?.trim();
  if (fromJob) return fromJob;
  const fromPayload = typeof payload?.brief === "string" ? payload.brief.trim() : "";
  return fromPayload || null;
}
