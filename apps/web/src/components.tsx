import type { CSSProperties, ReactNode } from "react";

const AGENT_COLORS: Record<string, string> = {
  research: "#60a5fa",
  bills: "#a78bfa",
  shopping: "#f472b6",
  broker: "#fbbf24",
  orchestrator: "#34d399",
};

const AGENT_LABELS: Record<string, string> = {
  research: "R",
  bills: "B",
  shopping: "S",
  broker: "K",
  orchestrator: "O",
};

export function AgentIcon({ role }: { role: string }) {
  const color = AGENT_COLORS[role] ?? "#94a3b8";
  const label = AGENT_LABELS[role] ?? role.slice(0, 1).toUpperCase();
  return (
    <span className="agent-avatar" style={{ "--agent-color": color } as CSSProperties}>
      {label}
    </span>
  );
}

export function StatusDot({ live }: { live: boolean }) {
  return (
    <span className={`status-pill ${live ? "live" : "dev"}`}>
      <span className="status-pill-dot" />
      {live ? "Live" : "Dev"}
    </span>
  );
}

export function MetricChip({
  label,
  value,
  variant = "default",
  accent,
}: {
  label: string;
  value: string;
  variant?: "default" | "success" | "warning";
  accent?: boolean;
}) {
  return (
    <div className={`metric-chip ${variant} ${accent ? "accent" : ""}`}>
      <span className="metric-chip-label">{label}</span>
      <span className="metric-chip-value">{value}</span>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="toggle" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" />
    </label>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  trend?: "up" | "neutral";
}) {
  return (
    <article className={`stat-card ${accent ? "accent" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
      {trend && <span className={`stat-trend ${trend}`} />}
    </article>
  );
}

export function BudgetRing({
  spent,
  total,
  compact = false,
}: {
  spent: number;
  total: number;
  compact?: boolean;
}) {
  const pct = total > 0 ? Math.min(100, (spent / total) * 100) : 0;
  const r = compact ? 40 : 52;
  const size = compact ? 96 : 128;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const cx = size / 2;

  return (
    <div className={`budget-ring ${compact ? "compact" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle className="ring-bg" cx={cx} cy={cx} r={r} />
        <circle
          className="ring-fill"
          cx={cx}
          cy={cx}
          r={r}
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <span className="ring-pct">{pct.toFixed(0)}%</span>
        {!compact && <span className="ring-label">used today</span>}
      </div>
    </div>
  );
}

export function Panel({
  title,
  desc,
  children,
  action,
  className = "",
}: {
  title: string;
  desc?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {desc && <p>{desc}</p>}
        </div>
        {action}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      </div>
      <strong>{title}</strong>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <span className="section-label">{children}</span>;
}

export function Badge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}
