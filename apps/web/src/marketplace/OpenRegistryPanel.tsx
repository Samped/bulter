import { useCallback, useEffect, useState } from "react";
import {
  formatUsdc,
  getAgentRegistry,
  probeRegistryUrl,
  setAgentApproval,
  type AgentRegistryResponse,
  type MarketplaceAgentCard,
} from "../api.ts";
import { IconChevronDown, IconSearch } from "../icons.tsx";

export function OpenRegistryPanel({ onStatsChange }: { onStatsChange?: () => void }) {
  const [registry, setRegistry] = useState<AgentRegistryResponse | null>(null);
  const [probeUrl, setProbeUrl] = useState("");
  const [probing, setProbing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localOpen, setLocalOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setRegistry(await getAgentRegistry());
      setError(null);
      onStatsChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load registry");
    }
  }, [onStatsChange]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleProbe = async () => {
    const url = probeUrl.trim();
    if (!url) return;
    setProbing(true);
    setError(null);
    setMessage(null);
    try {
      const res = await probeRegistryUrl(url, { save: true });
      if (!res.probe?.ok) {
        setError(res.error ?? res.probe?.error ?? "x402 probe failed");
        return;
      }
      setMessage(
        res.agent
          ? `${res.agent.name} probed · $${formatUsdc(res.probe.priceUsdc ?? res.agent.priceUsdc)} — approve below to allow auctions and payment`
          : "x402 endpoint verified — approve the agent to enable payment"
      );
      setProbeUrl("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Probe failed");
    } finally {
      setProbing(false);
    }
  };

  const handleApproval = async (agentId: string, approved: boolean) => {
    setTogglingId(agentId);
    setError(null);
    try {
      await setAgentApproval(agentId, approved);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update approval");
    } finally {
      setTogglingId(null);
    }
  };

  const agents = registry?.agents ?? [];
  const local = agents.filter((a) => a.origin !== "external");
  const external = agents.filter((a) => a.origin === "external");
  const approvalRequired = registry?.policy?.requireAgentApproval !== false;
  const approvedCount = registry?.approvedCount ?? agents.filter((a) => a.approved).length;

  return (
    <div className="mp-network">
      {registry?.policy && (
        <div className="mp-policy-bar">
          <span className="mp-policy-item">
            <span className="mp-policy-k">Max pay</span>
            <span className="mp-policy-v">${registry.policy.maxPriceUsdc}</span>
          </span>
          <span className="mp-policy-divider" />
          <span className="mp-policy-item">
            <span className="mp-policy-k">Domains</span>
            <span className="mp-policy-v">
              {registry.policy.domainAllowlist.length > 0
                ? registry.policy.domainAllowlist.length
                : "All allowed"}
            </span>
          </span>
          <span className="mp-policy-divider" />
          <span className="mp-policy-item">
            <span className="mp-policy-k">Discovery</span>
            <span className={`mp-policy-v ${registry.policy.openDiscovery ? "on" : ""}`}>
              {registry.policy.openDiscovery ? "On" : "Off"}
            </span>
          </span>
          {approvalRequired && (
            <>
              <span className="mp-policy-divider" />
              <span className="mp-policy-item">
                <span className="mp-policy-k">Approval</span>
                <span className="mp-policy-v on">{approvedCount} approved</span>
              </span>
            </>
          )}
        </div>
      )}

      {approvalRequired && (
        <p className="mp-network-intro muted">
          Only approved agents can bid in auctions and receive payment. Probed or discovered agents stay pending until you approve them.
        </p>
      )}

      <div className="mp-probe-card">
        <label className="mp-probe-label" htmlFor="probe-url">
          Register open-internet x402 agent
        </label>
        <div className="mp-probe-row">
          <input
            id="probe-url"
            className="field-input mp-probe-input"
            value={probeUrl}
            onChange={(e) => setProbeUrl(e.target.value)}
            placeholder="https://host.example/agents/research/execute"
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleProbe();
            }}
          />
          <button
            type="button"
            className="btn accent mp-probe-btn"
            disabled={probing || !probeUrl.trim()}
            onClick={() => void handleProbe()}
          >
            <IconSearch size={16} />
            {probing ? "Probing…" : "Probe"}
          </button>
        </div>
        <p className="mp-probe-hint muted">
          Validates HTTP 402 + PAYMENT-REQUIRED, registers the agent, then waits for your approval before auctions or payment.
        </p>
        {message && <p className="mp-alert mp-alert-success">{message}</p>}
        {error && <p className="mp-alert mp-alert-error">{error}</p>}
      </div>

      {external.length > 0 && (
        <section className="mp-agent-section">
          <div className="mp-section-label">
            <span className="mp-globe-dot" aria-hidden />
            <span>Open network · {external.length}</span>
          </div>
          <div className="mp-agent-grid">
            {external.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                approvalRequired={approvalRequired}
                toggling={togglingId === a.id}
                onApprovalChange={(approved) => void handleApproval(a.id, approved)}
              />
            ))}
          </div>
        </section>
      )}

      <section className="mp-agent-section">
        <button
          type="button"
          className="mp-collapse-trigger"
          onClick={() => setLocalOpen((o) => !o)}
          aria-expanded={localOpen}
        >
          <span className="mp-section-label muted">
            Local agents · {local.length}
          </span>
          <IconChevronDown size={16} className={`mp-chevron ${localOpen ? "open" : ""}`} />
        </button>
        {localOpen && (
          <div className="mp-agent-grid compact">
            {local.map((a) => (
              <AgentCard
                key={a.id}
                agent={a}
                compact
                approvalRequired={approvalRequired}
                toggling={togglingId === a.id}
                onApprovalChange={(approved) => void handleApproval(a.id, approved)}
              />
            ))}
          </div>
        )}
      </section>

      {external.length === 0 && (
        <p className="mp-network-foot muted">
          No external agents yet. Probe a URL above or add entries to{" "}
          <code>.data/external-agents.json</code>, then approve them here.
        </p>
      )}
    </div>
  );
}

function AgentCard({
  agent,
  compact = false,
  approvalRequired = false,
  toggling = false,
  onApprovalChange,
}: {
  agent: MarketplaceAgentCard & { approved?: boolean };
  compact?: boolean;
  approvalRequired?: boolean;
  toggling?: boolean;
  onApprovalChange?: (approved: boolean) => void;
}) {
  const external = agent.origin === "external";
  const host = agent.domain ?? (agent.serviceUrl ? safeHostname(agent.serviceUrl) : null);
  const approved = agent.approved !== false;

  return (
    <article className={`mp-agent-card ${compact ? "compact" : ""} ${external ? "external" : ""} ${!approved ? "pending" : ""}`}>
      <div className="mp-agent-card-top">
        <div className="mp-agent-avatar lg" aria-hidden>
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="mp-agent-card-head">
          <div className="mp-agent-name-row">
            <h4>{agent.name}</h4>
            {external && <span className="mp-badge open">Open</span>}
            {agent.x402Verified && <span className="mp-badge x402">x402</span>}
            {approvalRequired && (
              <span className={`mp-badge ${approved ? "approved" : "pending"}`}>
                {approved ? "Approved" : "Pending"}
              </span>
            )}
          </div>
          {!compact && <p className="mp-agent-tagline">{agent.tagline}</p>}
        </div>
      </div>
      <div className="mp-agent-card-foot">
        <span className="mp-agent-price mono">${formatUsdc(agent.priceUsdc)}</span>
        {agent.credit != null && <span className="mp-agent-rep">Rep {agent.credit.score}</span>}
        {host && !compact && <span className="mp-agent-host mono" title={agent.serviceUrl}>{host}</span>}
        {approvalRequired && onApprovalChange && (
          <button
            type="button"
            className={`btn sm mp-approve-btn ${approved ? "ghost" : "accent"}`}
            disabled={toggling}
            onClick={() => onApprovalChange(!approved)}
          >
            {toggling ? "…" : approved ? "Revoke" : "Approve"}
          </button>
        )}
      </div>
    </article>
  );
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 20);
  }
}
