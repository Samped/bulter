import type { MarketplaceDeliverable } from "../api.ts";
import { CombinedDeliverableBody, DeliverableSummary } from "./DeliverableContent.tsx";
import { IntelDeliverableBody, isIntelPayload } from "./defi-agents.tsx";
import { parseDeliverablePayload, resolveDeliverablePayload } from "./payload.ts";

/** Single render path for Library document content — never dump raw JSON for intel agents. */
export function LibraryDocumentBody({ job }: { job: MarketplaceDeliverable }) {
  const payload = resolveDeliverablePayload(job);
  const doneSteps = job.steps.filter((s) => s.status === "done" && s.output != null);

  if (payload && isIntelPayload(payload)) {
    return <IntelDeliverableBody payload={payload} brief={job.brief} />;
  }

  if (doneSteps.length > 0) {
    return <CombinedDeliverableBody steps={doneSteps} brief={job.brief} />;
  }

  const summary = job.summary?.trim();
  if (summary) {
    const parsed = parseDeliverablePayload(summary);
    if (parsed && isIntelPayload(parsed)) {
      return <IntelDeliverableBody payload={parsed} brief={job.brief} />;
    }
    if (!summary.startsWith("{")) {
      return <DeliverableSummary text={summary} />;
    }
  }

  return <p className="paper-prose paper-empty">No structured output was stored for this job.</p>;
}
