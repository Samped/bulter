/** Library rendering for DeFi Execution Agent plans. */

import type { ReactNode } from "react";

export function isDefiExecutionPayload(data: Record<string, unknown>): boolean {
  return data.type === "defi-execution" || (Array.isArray(data.securityChecks) && Array.isArray(data.quotes) && data.intent != null);
}

function RiskBadge({ label }: { label: unknown }) {
  const s = String(label ?? "unknown");
  return <span className={`paper-risk-badge risk-${s}`}>{s}</span>;
}

export function DefiExecutionBlock({ data }: { data: Record<string, unknown> }) {
  if (!isDefiExecutionPayload(data)) return null;
  const intent = (data.intent ?? {}) as Record<string, unknown>;
  const quotes = Array.isArray(data.quotes) ? (data.quotes as Record<string, unknown>[]) : [];
  const steps = Array.isArray(data.steps) ? (data.steps as Record<string, unknown>[]) : [];
  const blockers = Array.isArray(data.blockers) ? (data.blockers as Record<string, unknown>[]) : [];
  const checks = Array.isArray(data.securityChecks)
    ? (data.securityChecks as Record<string, unknown>[])
    : [];
  const nextActions = Array.isArray(data.nextActions) ? (data.nextActions as string[]) : [];
  const plugins = Array.isArray(data.pluginsUsed) ? (data.pluginsUsed as string[]) : [];

  return (
    <section className="paper-section">
      <h2 className="paper-section-title">DeFi Execution Plan</h2>
      <p className="paper-inline-meta">
        {String(data.mode ?? "plan")} · {String(data.status ?? "")} · risk{" "}
        <RiskBadge label={data.riskLabel} /> ({String(data.riskScore ?? "?")}/100)
        {data.executionEnabled ? " · broadcast flag ON" : " · broadcast disabled"}
      </p>
      {typeof data.summary === "string" && <p className="paper-prose">{data.summary}</p>}

      <h3 className="paper-section-subtitle">Intent</h3>
      <div className="paper-stat-grid">
        <div className="paper-stat">
          <span className="paper-stat-label">Action</span>
          <span className="paper-stat-value">{String(intent.action ?? "—")}</span>
        </div>
        <div className="paper-stat">
          <span className="paper-stat-label">Amount in</span>
          <span className="paper-stat-value">
            {String(intent.amountIn ?? "—")} {String((intent.tokenIn as Record<string, unknown>)?.symbol ?? "")}
          </span>
        </div>
        <div className="paper-stat">
          <span className="paper-stat-label">Route</span>
          <span className="paper-stat-value">
            {String(intent.sourceChain ?? "?")} → {String(intent.destChain ?? "?")}
          </span>
        </div>
        <div className="paper-stat">
          <span className="paper-stat-label">Out</span>
          <span className="paper-stat-value">
            {String((intent.tokenOut as Record<string, unknown>)?.symbol ?? "—")}
          </span>
        </div>
      </div>

      {checks.length > 0 && (
        <>
          <h3 className="paper-section-subtitle">Security checklist</h3>
          <ul className="paper-bullet-list">
            {checks.map((c, i) => (
              <li key={i}>
                <strong>{c.passed ? "PASS" : "FAIL"}</strong> — {String(c.label)}: {String(c.detail)}
              </li>
            ))}
          </ul>
        </>
      )}

      {blockers.length > 0 && (
        <>
          <h3 className="paper-section-subtitle">Guards</h3>
          <ul className="paper-bullet-list">
            {blockers.map((b, i) => (
              <li key={i}>
                <strong>{String(b.severity).toUpperCase()}</strong> [{String(b.code)}]: {String(b.message)}
              </li>
            ))}
          </ul>
        </>
      )}

      {quotes.length > 0 && (
        <>
          <h3 className="paper-section-subtitle">Quotes</h3>
          <ol className="paper-numbered-list">
            {quotes.map((q, i) => (
              <li key={i}>
                <strong>{String(q.routeLabel)}</strong>
                <br />
                {String(q.amountIn)} {String(q.tokenIn)} → ~{String(q.amountOutEstimated)}{" "}
                {String(q.tokenOut)} (min {String(q.amountOutMin)}) · impact {String(q.priceImpactBps)}{" "}
                bps · gas ~${String(q.gasUsdEstimated)} · plugin {String(q.plugin)}
              </li>
            ))}
          </ol>
        </>
      )}

      {steps.length > 0 && (
        <>
          <h3 className="paper-section-subtitle">Plan steps</h3>
          <ol className="paper-numbered-list">
            {steps.map((s, i) => (
              <li key={i}>
                <strong>
                  {String(s.kind)} — {String(s.title)}
                </strong>
                <br />
                {String(s.detail)}
                {s.target ? (
                  <>
                    <br />
                    <span className="paper-inline-meta">
                      target {String(s.target)}
                      {s.selector ? ` · ${String(s.selector)}` : ""}
                    </span>
                  </>
                ) : null}
                {Array.isArray(s.riskNotes) && (s.riskNotes as string[]).length > 0 ? (
                  <ul className="paper-bullet-list">
                    {(s.riskNotes as string[]).map((n, j) => (
                      <li key={j}>{n}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        </>
      )}

      {typeof data.confirmNonce === "string" && data.confirmNonce && (
        <p className="paper-prose">
          <strong>confirmNonce</strong> (for a future gated execute):{" "}
          <code>{data.confirmNonce}</code>
        </p>
      )}

      {plugins.length > 0 && (
        <p className="paper-inline-meta">Plugins: {plugins.join(", ")}</p>
      )}

      {nextActions.length > 0 && (
        <>
          <h3 className="paper-section-subtitle">Next actions</h3>
          <ol className="paper-numbered-list">
            {nextActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export function renderDefiExecutionBlocks(
  steps: { agentId?: string; output?: unknown }[],
): ReactNode[] {
  const blocks: ReactNode[] = [];
  for (const step of steps) {
    const out = step.output;
    if (!out || typeof out !== "object") continue;
    const data = out as Record<string, unknown>;
    if (isDefiExecutionPayload(data)) {
      blocks.push(<DefiExecutionBlock key={`defi-exec-${blocks.length}`} data={data} />);
    }
  }
  return blocks;
}

export function DefiExecutionDeliverableBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="paper-intel-root">
      <DefiExecutionBlock data={payload} />
    </div>
  );
}
