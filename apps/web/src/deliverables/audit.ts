import type { MarketplaceDeliverable } from "../api.ts";
import { unwrapAgentPayload } from "./format.ts";

/** Extract Solidity source from a brief or attached file body. */
export function extractSoliditySource(text: string): string | null {
  const t = text.trim();
  if (!/pragma\s+solidity/i.test(t)) return null;

  const lines = t.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (/^(\/\/|\/\*|pragma\s+solidity|contract\s+|interface\s+|library\s+|import\s+)/i.test(line)) {
      start = i;
      break;
    }
  }
  const source = lines.slice(start).join("\n").trim();
  return source || null;
}

export function contractNameFromSource(source: string): string | null {
  const match = source.match(/contract\s+(\w+)/i);
  return match?.[1] ?? null;
}

export function resolveAuditContractSource(
  jobBrief?: string,
  auditPayload?: Record<string, unknown> | null
): string | null {
  const fromJob = jobBrief ? extractSoliditySource(jobBrief) : null;
  if (fromJob) return fromJob;
  if (typeof auditPayload?.sourceCode === "string" && auditPayload.sourceCode.trim()) {
    return auditPayload.sourceCode.trim();
  }
  const payloadBrief = typeof auditPayload?.brief === "string" ? auditPayload.brief : "";
  return payloadBrief ? extractSoliditySource(payloadBrief) : null;
}

export function isAuditDeliverable(job: Pick<MarketplaceDeliverable, "brief" | "plan" | "steps">): boolean {
  if (job.steps.some((s) => s.agentId === "audit-agent")) return true;
  if (/pragma\s+solidity/i.test(job.brief ?? "")) return true;
  if (/audit agent|contract audit|security audit/i.test(job.plan?.reason ?? "")) return true;
  const auditStep = job.steps.find((s) => s.output != null);
  if (auditStep) {
    const data = unwrapAgentPayload(auditStep.output);
    if (data?.type === "audit" || Array.isArray(data?.findings)) return true;
  }
  return false;
}

export function auditPaperTitle(
  job: Pick<MarketplaceDeliverable, "brief">,
  auditPayload?: Record<string, unknown> | null
): string {
  const name =
    (typeof auditPayload?.contract === "string" && auditPayload.contract) ||
    (job.brief ? contractNameFromSource(job.brief) : null);
  return name ? `${name} — Security Audit` : "Smart Contract Security Audit";
}

export function auditSeverityClass(severity: unknown): string {
  const s = String(severity ?? "").toLowerCase();
  if (s === "critical") return "audit-severity-critical";
  if (s === "high") return "audit-severity-high";
  if (s === "medium") return "audit-severity-medium";
  if (s === "low") return "audit-severity-low";
  return "audit-severity-info";
}
