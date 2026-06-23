function unwrapAgentPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const response = obj.response;
  if (response && typeof response === "object") {
    const inner = response as Record<string, unknown>;
    if (inner.data && typeof inner.data === "object") return inner.data as Record<string, unknown>;
    return inner;
  }
  if (obj.data && typeof obj.data === "object") return obj.data as Record<string, unknown>;
  return obj;
}

/** Merge multi-agent step outputs into one library document payload. */
export function combineWorkflowResult(steps: { output?: unknown }[]): Record<string, unknown> | null {
  const payloads = steps
    .map((s) => unwrapAgentPayload(s.output))
    .filter((p): p is Record<string, unknown> => !!p);
  if (payloads.length === 0) return null;
  if (payloads.length === 1) return payloads[0]!;

  const combined: Record<string, unknown> = { type: "combined" };

  for (const p of payloads) {
    if (Array.isArray(p.headlines)) {
      combined.headlines = [...(Array.isArray(combined.headlines) ? combined.headlines : []), ...p.headlines];
      if (p.topic) combined.ticker = p.topic;
    }
    if (typeof p.symbol === "string" && p.price != null) {
      combined.symbol = p.symbol;
      combined.price = p.price;
      combined.change24h = p.change24h;
      combined.volume = p.volume;
      combined.asOf = p.asOf;
      combined.source = p.source;
    }
    if (p.report && typeof p.report === "object") combined.report = p.report;
    if (typeof p.executiveSummary === "string") combined.executiveSummary = p.executiveSummary;
    if (p.focus) combined.focus = p.focus;
    if (p.type === "research") combined.type = "research";
    if (Array.isArray(p.keyFindings)) {
      combined.keyFindings = [...(Array.isArray(combined.keyFindings) ? combined.keyFindings : []), ...p.keyFindings];
    }
    if (Array.isArray(p.papers)) {
      combined.papers = [...(Array.isArray(combined.papers) ? combined.papers : []), ...p.papers];
    }
    if (Array.isArray(p.risks)) {
      combined.risks = [...(Array.isArray(combined.risks) ? combined.risks : []), ...p.risks];
    }
    if (typeof p.methodology === "string") combined.methodology = p.methodology;
    if (typeof p.score === "number" && typeof p.label === "string") {
      combined.score = p.score;
      combined.label = p.label;
      combined.sources = p.sources;
    }
    if (typeof p.pattern === "string") {
      combined.pattern = p.pattern;
      combined.support = p.support;
      combined.resistance = p.resistance;
      combined.rsi = p.rsi;
    }
    if (p.type === "defi" || Array.isArray(p.topProtocols)) combined.defi = p;
    if (p.type === "macro" || typeof p.fedOutlook === "string") combined.macro = p;
    if (p.type === "onchain" || Array.isArray(p.signals)) combined.onchain = p;
    if (p.type === "risk" || typeof p.riskScore === "number") combined.risk = p;
    if (typeof p.contract === "string") {
      combined.contract = p.contract;
      combined.findings = p.findings;
      combined.riskLevel = p.riskLevel;
    }
  }

  return combined;
}
