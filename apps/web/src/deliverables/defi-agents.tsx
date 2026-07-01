import type { ReactNode } from "react";

function severityClass(severity: unknown): string {
  const s = String(severity ?? "").toLowerCase();
  if (s === "high") return "intel-sev high";
  if (s === "medium") return "intel-sev medium";
  return "intel-sev low";
}

function scoreTone(score: number, invert = false): "good" | "warn" | "bad" {
  const effective = invert ? 100 - score : score;
  if (effective >= 70) return "good";
  if (effective >= 40) return "warn";
  return "bad";
}

function ScoreMeter({
  label,
  score,
  invert = false,
  hint,
}: {
  label: string;
  score: number;
  invert?: boolean;
  hint?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = scoreTone(clamped, invert);
  return (
    <div className={`intel-score-meter tone-${tone}`}>
      <div className="intel-score-meter-head">
        <span className="intel-score-meter-label">{label}</span>
        <span className="intel-score-meter-value">{clamped}/100</span>
      </div>
      <div className="intel-score-meter-track" aria-hidden>
        <div className="intel-score-meter-fill" style={{ width: `${clamped}%` }} />
      </div>
      {hint ? <p className="intel-score-meter-hint">{hint}</p> : null}
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const v = verdict.toLowerCase().replace(/\s+/g, " ").trim();
  const tone =
    v === "recommended" || v === "favorable"
      ? "positive"
      : v === "avoid"
        ? "negative"
        : v.includes("caution")
          ? "warn"
          : "neutral";
  const label =
    v === "recommended"
      ? "Copy trade: Recommended"
      : v === "favorable"
        ? "Copy trade: Favorable"
        : v === "avoid"
          ? "Copy trade: Avoid"
          : v === "caution" || v === "caution advised"
            ? "Copy trade: Caution"
            : v === "neutral"
              ? "Copy trade: Neutral"
              : `Copy trade: ${verdict}`;
  return <span className={`intel-verdict tone-${tone}`}>{label}</span>;
}

function formatUsd(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatSupply(n: unknown): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function walletFromPayload(data: Record<string, unknown>, brief?: string): string {
  const addr = typeof data.address === "string" ? data.address : "";
  if (addr && addr !== "0x0000000000000000000000000000000000000000") return addr;
  const fromBrief = brief?.match(/0x[a-fA-F0-9]{38,40}/)?.[0];
  return fromBrief ?? addr ?? "—";
}

function isWalletReputation(data: Record<string, unknown>): boolean {
  return data.type === "wallet-reputation" || typeof data.scamScore === "number";
}

function isTokenResearch(data: Record<string, unknown>): boolean {
  return (
    data.type === "token-research" ||
    typeof data.token === "string" ||
    typeof data.tokenSymbol === "string"
  );
}

function isCryptoNews(data: Record<string, unknown>): boolean {
  return data.type === "crypto-news-intelligence" || Array.isArray(data.marketMovingEvents);
}

function isPortfolioRisk(data: Record<string, unknown>): boolean {
  return data.type === "portfolio-risk" || typeof data.portfolioRiskScore === "number";
}

export function WalletReputationBlock({
  data,
  brief,
}: {
  data: Record<string, unknown>;
  brief?: string;
}) {
  if (!isWalletReputation(data)) return null;

  const defi = data.defiHistory as Record<string, unknown> | undefined;
  const pnl = data.pnlEstimate as Record<string, unknown> | undefined;
  const protocols = Array.isArray(defi?.protocols) ? (defi!.protocols as string[]) : [];
  const flags = Array.isArray(data.flags) ? (data.flags as string[]) : [];
  const address = walletFromPayload(data, brief);
  const verdict = String(data.copyTradeVerdict ?? "neutral");

  return (
    <div className="intel-deliverable intel-wallet">
      <header className="intel-hero">
        <div className="intel-hero-main">
          <p className="intel-kicker">Wallet Reputation</p>
          <p className="intel-wallet-address mono">{address}</p>
          <VerdictBadge verdict={verdict} />
        </div>
        {typeof data.generatedAt === "string" && (
          <time className="intel-asof" dateTime={data.generatedAt}>
            {new Date(data.generatedAt).toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        )}
      </header>

      <div className="intel-score-grid three">
        <ScoreMeter label="Scam risk" score={Number(data.scamScore ?? 0)} invert hint="Lower is safer" />
        <ScoreMeter label="Whale signal" score={Number(data.whaleScore ?? 0)} hint="Higher = larger footprint" />
        <ScoreMeter label="Sybil risk" score={Number(data.sybilScore ?? 0)} invert hint="Lower is safer" />
      </div>

      {defi && (
        <section className="intel-card">
          <h3 className="intel-card-title">DeFi history</h3>
          <div className="intel-meta-row">
            <span>
              <strong>Activity:</strong> {String(defi.activityLevel ?? "—")}
            </span>
            <span>
              <strong>Tenure:</strong> {String(defi.tenure ?? "—")}
            </span>
          </div>
          {protocols.length > 0 && (
            <div className="intel-chip-row">
              {protocols.map((p) => (
                <span key={p} className="intel-chip">
                  {p}
                </span>
              ))}
            </div>
          )}
        </section>
      )}

      {pnl && (
        <section className="intel-card">
          <h3 className="intel-card-title">PnL estimate</h3>
          <p className="intel-pnl-label">{String(pnl.label ?? "—")}</p>
          <p className="intel-meta-row">
            <span className={`intel-confidence conf-${String(pnl.confidence ?? "low")}`}>
              Confidence: {String(pnl.confidence ?? "—")}
            </span>
          </p>
          {typeof pnl.note === "string" && <p className="paper-prose paper-prose-muted">{pnl.note}</p>}
        </section>
      )}

      {flags.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Flags</h2>
          <ul className="intel-flag-list">
            {flags.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      {typeof data.summary === "string" && (
        <section className="paper-section">
          <h2 className="paper-section-title">Assessment</h2>
          <p className="paper-prose">{data.summary}</p>
        </section>
      )}

      {typeof data.disclaimer === "string" && (
        <footer className="intel-disclaimer">{data.disclaimer}</footer>
      )}
    </div>
  );
}

export function TokenResearchBlock({ data }: { data: Record<string, unknown> }) {
  if (!isTokenResearch(data)) return null;

  const token = String(data.token ?? data.tokenSymbol ?? "—");
  const market = data.marketData as Record<string, unknown> | undefined;
  const holders = data.holders as Record<string, unknown> | undefined;
  const tvl = data.tvl as Record<string, unknown> | undefined;
  const tokenomics = data.tokenomics as Record<string, unknown> | undefined;
  const unlock = data.unlockSchedule as Record<string, unknown> | unknown[] | undefined;
  const competitors = Array.isArray(data.competitors) ? (data.competitors as Record<string, unknown>[]) : [];
  const risks = Array.isArray(data.risks) ? (data.risks as Record<string, unknown>[]) : [];

  const holderNarrative =
    typeof holders?.distributionNarrative === "string"
      ? holders.distributionNarrative
      : typeof holders?.distribution === "string"
        ? holders.distribution
        : null;
  const topHolders = Array.isArray(holders?.topHolders) ? (holders!.topHolders as string[]) : [];

  return (
    <div className="intel-deliverable intel-token">
      <header className="intel-token-hero">
        <div className="intel-token-hero-left">
          <p className="intel-kicker">Token Research</p>
          <div className="intel-token-title-row">
            <span className="intel-token-symbol">{token}</span>
            {market?.name ? <span className="intel-token-name">{String(market.name)}</span> : null}
          </div>
          {typeof data.summary === "string" && (
            <p className="intel-lead">{data.summary}</p>
          )}
        </div>
        {market && (
          <div className="intel-token-metrics">
            <div className="intel-metric-card primary">
              <span className="intel-stat-label">Price</span>
              <span className="intel-metric-value">{formatUsd(market.priceUsd)}</span>
            </div>
            <div className="intel-metric-card">
              <span className="intel-stat-label">Market cap</span>
              <span className="intel-metric-value">{formatUsd(market.marketCapUsd)}</span>
            </div>
            <div className="intel-metric-card">
              <span className="intel-stat-label">24h volume</span>
              <span className="intel-metric-value">{formatUsd(market.volume24hUsd)}</span>
            </div>
            {market.circulatingSupply != null && (
              <div className="intel-metric-card">
                <span className="intel-stat-label">Circulating</span>
                <span className="intel-metric-value">{formatSupply(market.circulatingSupply)}</span>
              </div>
            )}
          </div>
        )}
      </header>

      {(typeof data.bullCase === "string" || typeof data.bearCase === "string") && (
        <div className="intel-case-grid">
          {typeof data.bullCase === "string" && (
            <section className="intel-case bull">
              <h3 className="intel-case-title">Bull case</h3>
              <p className="intel-case-body">{data.bullCase}</p>
            </section>
          )}
          {typeof data.bearCase === "string" && (
            <section className="intel-case bear">
              <h3 className="intel-case-title">Bear case</h3>
              <p className="intel-case-body">{data.bearCase}</p>
            </section>
          )}
        </div>
      )}

      <div className="intel-two-col">
        {tokenomics && (
          <section className="intel-panel">
            <h3 className="intel-panel-title">Tokenomics</h3>
            <dl className="intel-dl">
              {tokenomics.model ? (
                <>
                  <dt>Model</dt>
                  <dd>{String(tokenomics.model)}</dd>
                </>
              ) : null}
              {tokenomics.inflation ? (
                <>
                  <dt>Inflation</dt>
                  <dd>{String(tokenomics.inflation)}</dd>
                </>
              ) : null}
              {tokenomics.utility ? (
                <>
                  <dt>Utility</dt>
                  <dd>{String(tokenomics.utility)}</dd>
                </>
              ) : null}
              {tokenomics.supplyNotes ? (
                <>
                  <dt>Supply</dt>
                  <dd>{String(tokenomics.supplyNotes)}</dd>
                </>
              ) : null}
            </dl>
          </section>
        )}

        {tvl && (
          <section className="intel-panel">
            <h3 className="intel-panel-title">TVL & ecosystem</h3>
            <p className="intel-tvl-estimate">{String(tvl.estimate ?? "—")}</p>
            {Array.isArray(tvl.protocols) && (tvl.protocols as string[]).length > 0 && (
              <div className="intel-chip-row">
                {(tvl.protocols as string[]).map((p) => (
                  <span key={p} className="intel-chip">
                    {p}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {(holderNarrative || topHolders.length > 0) && (
        <section className="intel-panel">
          <h3 className="intel-panel-title">Holder distribution</h3>
          {holderNarrative && <p className="intel-panel-prose">{holderNarrative}</p>}
          {topHolders.length > 0 && (
            <div className="intel-holder-stats">
              {topHolders.map((h, i) => (
                <div key={i} className="intel-holder-stat">
                  {h}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {unlock != null && (
        <section className="intel-panel">
          <h3 className="intel-panel-title">Unlock schedule</h3>
          {Array.isArray(unlock) ? (
            <ul className="intel-timeline">
              {(unlock as Record<string, unknown>[]).map((u, i) => (
                <li key={i}>
                  <span className="intel-timeline-date">{String(u.date ?? "—")}</span>
                  <span className="intel-timeline-body">
                    {String(u.amount ?? "")}
                    {u.note ? ` — ${String(u.note)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : typeof (unlock as Record<string, unknown>).upcomingUnlocks === "string" ? (
            <p className="intel-panel-prose">{(unlock as Record<string, unknown>).upcomingUnlocks as string}</p>
          ) : null}
        </section>
      )}

      {competitors.length > 0 && (
        <section className="intel-panel">
          <h3 className="intel-panel-title">Competitors</h3>
          <table className="intel-comp-table">
            <thead>
              <tr>
                <th>Protocol</th>
                <th>Differentiator</th>
              </tr>
            </thead>
            <tbody>
              {competitors.map((c, i) => (
                <tr key={i}>
                  <td className="intel-comp-name">{String(c.name ?? "—")}</td>
                  <td>{String(c.differentiator ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {risks.length > 0 && (
        <section className="intel-panel">
          <h3 className="intel-panel-title">Key risks</h3>
          <div className="intel-risk-grid">
            {risks.map((r, i) => (
              <article key={i} className="intel-risk-card">
                <span className={severityClass(r.severity)}>{String(r.severity ?? "—").toUpperCase()}</span>
                <p>{String(r.risk ?? r)}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {typeof data.source === "string" && (
        <footer className="intel-disclaimer">
          Data source: {String(data.source)}
          {typeof data.generatedAt === "string"
            ? ` · ${new Date(data.generatedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`
            : ""}
        </footer>
      )}
    </div>
  );
}

export function CryptoNewsBlock({ data }: { data: Record<string, unknown> }) {
  if (!isCryptoNews(data)) return null;

  const sentiment = data.marketSentiment as Record<string, unknown> | undefined;
  const events = Array.isArray(data.marketMovingEvents)
    ? (data.marketMovingEvents as Record<string, unknown>[])
    : [];
  const themes = Array.isArray(data.themes) ? (data.themes as string[]) : [];

  const sentLabel = String(sentiment?.label ?? "neutral");
  const sentScore = Number(sentiment?.score ?? 0);

  return (
    <div className="intel-deliverable intel-news">
      <header className="intel-hero">
        <div className="intel-hero-main">
          <p className="intel-kicker">Market Intelligence</p>
          <h2 className="intel-news-topic">{String(data.topic ?? "Crypto markets")}</h2>
          <span className={`intel-sentiment tone-${sentLabel}`}>
            {sentLabel} {Number.isFinite(sentScore) ? `(${sentScore > 0 ? "+" : ""}${sentScore})` : ""}
          </span>
        </div>
        {data.sourcesScanned != null && (
          <p className="intel-asof">{String(data.sourcesScanned)} sources scanned</p>
        )}
      </header>

      {typeof data.summary === "string" && (
        <section className="paper-section">
          <h2 className="paper-section-title">Executive summary</h2>
          <p className="paper-prose">{data.summary}</p>
        </section>
      )}

      {themes.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Themes</h2>
          <div className="intel-chip-row">
            {themes.map((t) => (
              <span key={t} className="intel-chip">
                {t}
              </span>
            ))}
          </div>
        </section>
      )}

      {events.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Market-moving events</h2>
          <div className="intel-event-list">
            {events.map((e, i) => {
              const url = typeof e.url === "string" ? e.url : null;
              const bb = Number(e.bullishBearish ?? 0);
              return (
                <article key={i} className="intel-event-card">
                  <div className="intel-event-head">
                    <span className={severityClass(e.impact)}>{String(e.impact ?? "medium").toUpperCase()}</span>
                    <span className={`intel-bias ${bb > 0 ? "up" : bb < 0 ? "down" : ""}`}>
                      {bb > 0 ? "Bullish" : bb < 0 ? "Bearish" : "Neutral"}
                    </span>
                  </div>
                  <h4 className="intel-event-title">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {String(e.headline ?? "Headline")}
                      </a>
                    ) : (
                      String(e.headline ?? "Headline")
                    )}
                  </h4>
                  <p className="intel-event-source">{String(e.source ?? "")}</p>
                  {typeof e.whyItMatters === "string" && (
                    <p className="paper-prose paper-prose-muted">{e.whyItMatters}</p>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export function PortfolioRiskBlock({ data }: { data: Record<string, unknown> }) {
  if (!isPortfolioRisk(data)) return null;

  const liq = data.liquidationRisk as Record<string, unknown> | undefined;
  const var_ = data.valueAtRisk as Record<string, unknown> | undefined;
  const factors = Array.isArray(data.factors) ? (data.factors as Record<string, unknown>[]) : [];
  const hedges = Array.isArray(data.hedges) ? (data.hedges as Record<string, unknown>[]) : [];
  const atRisk = Array.isArray(liq?.positionsAtRisk) ? (liq!.positionsAtRisk as string[]) : [];

  return (
    <div className="intel-deliverable intel-portfolio-risk">
      <header className="intel-hero">
        <div className="intel-hero-main">
          <p className="intel-kicker">Portfolio Risk</p>
          <div className="intel-risk-score-ring">
            <span className="intel-risk-score-num">{String(data.portfolioRiskScore ?? "—")}</span>
            <span className="intel-risk-score-sub">/ 100</span>
          </div>
        </div>
        <div className="intel-risk-pills">
          {liq && (
            <span className="intel-chip">
              Liquidation: {String(liq.label ?? "—")} ({String(liq.score ?? "—")})
            </span>
          )}
          {var_ && (
            <span className="intel-chip">
              VaR {String(var_.confidence ?? "95%")} · {String(var_.estimateUsd ?? "—")}
            </span>
          )}
        </div>
      </header>

      {typeof data.summary === "string" && (
        <section className="paper-section">
          <h2 className="paper-section-title">Overview</h2>
          <p className="paper-prose">{data.summary}</p>
        </section>
      )}

      {atRisk.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Positions at risk</h2>
          <ul className="intel-risk-positions">
            {atRisk.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        </section>
      )}

      {factors.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Risk factors</h2>
          <ul className="intel-risk-list">
            {factors.map((f, i) => (
              <li key={i}>
                <span className={severityClass(f.severity)}>{String(f.severity ?? "—").toUpperCase()}</span>
                <span>
                  <strong>{String(f.name ?? "Factor")}</strong> — {String(f.note ?? "")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hedges.length > 0 && (
        <section className="paper-section">
          <h2 className="paper-section-title">Suggested hedges</h2>
          <div className="intel-hedge-grid">
            {hedges.map((h, i) => (
              <article key={i} className="intel-hedge-card">
                <h4>{String(h.action ?? "Hedge")}</h4>
                <p className="intel-hedge-instrument">{String(h.instrument ?? "")}</p>
                <p className="paper-prose paper-prose-muted">{String(h.rationale ?? "")}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {var_ && typeof var_.note === "string" && (
        <footer className="intel-disclaimer">
          {String(var_.horizon ?? "24h")} {String(var_.confidence ?? "95%")} VaR — {var_.note}
        </footer>
      )}
    </div>
  );
}

/** Render blocks for DeFi intelligence agent payloads (single or combined). */
export function renderDeFiAgentBlocks(
  data: Record<string, unknown>,
  brief?: string
): ReactNode[] {
  const blocks: ReactNode[] = [];
  if (isWalletReputation(data)) blocks.push(<WalletReputationBlock key="wallet" data={data} brief={brief} />);
  if (isTokenResearch(data)) blocks.push(<TokenResearchBlock key="token" data={data} />);
  if (isCryptoNews(data)) blocks.push(<CryptoNewsBlock key="news" data={data} />);
  if (isPortfolioRisk(data)) blocks.push(<PortfolioRiskBlock key="portfolio-risk" data={data} />);
  return blocks;
}

export function isIntelPayload(data: Record<string, unknown>): boolean {
  return (
    isWalletReputation(data) ||
    isTokenResearch(data) ||
    isCryptoNews(data) ||
    isPortfolioRisk(data)
  );
}

export function intelDeliverableKicker(data: Record<string, unknown>): string {
  if (isTokenResearch(data)) return "Butler Token Research";
  if (isWalletReputation(data)) return "Butler Wallet Intelligence";
  if (isCryptoNews(data)) return "Butler Market Intelligence";
  if (isPortfolioRisk(data)) return "Butler Portfolio Risk";
  return "Butler Intelligence Brief";
}

export function IntelDeliverableBody({
  payload,
  brief,
}: {
  payload: Record<string, unknown>;
  brief?: string;
}) {
  const blocks = renderDeFiAgentBlocks(payload, brief);
  if (blocks.length === 0) {
    return <p className="paper-prose paper-empty">Could not render this deliverable.</p>;
  }
  return <div className="paper-intel-root">{blocks}</div>;
}

export function resolveDeFiPayload(
  merged: Record<string, unknown>,
  key: "walletReputation" | "tokenResearch" | "newsIntelligence" | "portfolioRisk"
): Record<string, unknown> | null {
  const nested = merged[key];
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return null;
}
