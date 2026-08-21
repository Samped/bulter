import { useCallback, useEffect, useRef, useState } from "react";
import {
  formatUsdc,
  fundCircleWallet,
  getAgentStatus,
  getCircleStatus,
  getCircleStatusQuick,
  getHealth,
  getHealthQuick,
  getLedger,
  loadPayerDisplayCache,
  runMarketplaceWorkflow as apiRunMarketplaceWorkflow,
  savePayerDisplayCache,
  shortAddr,
  circleLogout,
  resetBrowserSessionId,
  clearPayerDisplayCache,
  isolateBrowserSessionForPayer,
  clearPayerIdentityMarker,
  clearAllLibraryCaches,
  type AgentStatus,
  type CircleStatus,
  type Health,
  type SpendRecord,
} from "./api.ts";
import {
  EmptyState,
  MetricChip,
  Panel,
  StatusDot,
} from "./components.tsx";
import {
  IconActivity,
  IconAgent,
  IconClose,
  IconLibrary,
  IconMarketplace,
  IconMenu,
  IconRefresh,
  IconTrace,
  IconWallet,
} from "./icons.tsx";
import { PaymentTrace } from "./trace/PaymentTrace.tsx";
import { ActivityDetail } from "./activity/ActivityDetail.tsx";
import { MarketplaceView } from "./marketplace/MarketplaceView.tsx";
import { AgentChatView } from "./agent/AgentChatView.tsx";
import { DeliverablesView } from "./deliverables/DeliverablesView.tsx";
import { CircleLoginPanel } from "./circle/CircleLoginPanel.tsx";
import { formatWorkflowError } from "./format.ts";
import { useIsMobile } from "./use-mobile.ts";

type Tab = "agent" | "library" | "marketplace" | "activity" | "trace";
type ActivityScope = "all" | "mine";

const SERVICE_LABELS: Record<string, string> = {
  "research-summary": "News / summary",
  "research-papers": "Research agent",
  "price-feed": "Market / price feed",
  "utility-quote": "Report / bill agent",
  "subscription-check": "Subscription agent",
  "x402-transfer": "Agent payment",
};

const NAV: { id: Tab; label: string; Icon: typeof IconMarketplace }[] = [
  { id: "agent", label: "Agent", Icon: IconAgent },
  { id: "library", label: "Library", Icon: IconLibrary },
  { id: "marketplace", label: "Auctions", Icon: IconMarketplace },
  { id: "activity", label: "Activity", Icon: IconActivity },
  { id: "trace", label: "Trace", Icon: IconTrace },
];

function shortEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local.length > 14 ? `${local.slice(0, 13)}…` : local;
}

function circleStatusFromCache(): CircleStatus | null {
  const cached = loadPayerDisplayCache();
  if (!cached?.loggedIn) return null;
  return {
    installed: true,
    runnable: true,
    loggedIn: true,
    version: null,
    executorAddress: cached.executorAddress ?? null,
    email: cached.email,
    gatewayBalanceUsdc: cached.gatewayBalanceUsdc ?? null,
    chain: "ARC-TESTNET",
  };
}

export function App() {
  const [tab, setTab] = useState<Tab>("agent");
  const [ledger, setLedger] = useState<SpendRecord[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const [circleStatus, setCircleStatus] = useState<CircleStatus | null>(() => circleStatusFromCache());
  const [workflowRunning, setWorkflowRunning] = useState(false);
  const [workflowMessage, setWorkflowMessage] = useState<string | null>(null);
  const [traceSettlementId, setTraceSettlementId] = useState("");
  const [libraryJobId, setLibraryJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectSlow, setConnectSlow] = useState(false);
  const [activityScope, setActivityScope] = useState<ActivityScope>("mine");
  const [activityRecords, setActivityRecords] = useState<SpendRecord[]>([]);
  const [ledgerTotalCount, setLedgerTotalCount] = useState(0);
  const [activityPayerAddresses, setActivityPayerAddresses] = useState<string[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<SpendRecord | null>(null);
  const [butlerBusy, setButlerBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false);
  const [gatewayFunding, setGatewayFunding] = useState(false);
  const [gatewayFundError, setGatewayFundError] = useState<string | null>(null);
  const autoFundExecutorRef = useRef<string | null>(null);
  const isMobile = useIsMobile();

  const loadActivityLedger = useCallback(async (scope: ActivityScope) => {
    setActivityLoading(true);
    try {
      const ledgerRes = await getLedger(scope);
      const records = ledgerRes.records;
      const total = ledgerRes.totalCount ?? records.length;
      if (scope === "all") {
        setLedger(records);
      }
      setActivityRecords(records);
      setLedgerTotalCount(total);
      if (ledgerRes.activityPayerAddresses?.length) {
        setActivityPayerAddresses(ledgerRes.activityPayerAddresses);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Ledger unavailable";
      setError(msg);
    } finally {
      setActivityLoading(false);
    }

    void getAgentStatus()
      .then((statusRes) => {
        setAgentStatus(statusRes);
        if (statusRes.activityPayerAddresses?.length) {
          setActivityPayerAddresses(statusRes.activityPayerAddresses);
        }
      })
      .catch(() => undefined);
  }, []);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    const silent = opts?.quiet ?? false;
    if (!silent) setRefreshing(true);
    const failed: string[] = [];
    const pick = <T,>(r: PromiseSettledResult<T>, label: string): T | null => {
      if (r.status === "fulfilled") return r.value;
      if (!silent) {
        failed.push(`${label}: ${formatWorkflowError(r.reason instanceof Error ? r.reason.message : "failed")}`);
      }
      return null;
    };

    try {
      const [cs, as, h] = await Promise.allSettled([
        getCircleStatusQuick(),
        getAgentStatus(),
        getHealth(),
      ]);

      const csRes = pick(cs, "circle/status");
      if (csRes) {
        setCircleStatus((prev) => {
          const cacheLoggedIn = !!loadPayerDisplayCache()?.loggedIn;
          if (!csRes.loggedIn && (prev?.loggedIn || cacheLoggedIn)) {
            return prev ?? csRes;
          }
          savePayerDisplayCache(csRes);
          return csRes;
        });
        if (csRes.loggedIn) savePayerDisplayCache(csRes);
      }
      const asRes = pick(as, "agent/status");
      if (asRes) {
        setAgentStatus(asRes);
        if (asRes.activityPayerAddresses?.length) setActivityPayerAddresses(asRes.activityPayerAddresses);
      }

      const healthRes = pick(h, "health");
      if (healthRes) setHealth(healthRes);

      if (!healthRes && !csRes && !asRes) {
        if (!silent) {
          setError(failed.join(" · ") || "Cannot reach API — run npm run dev:api");
        }
        return false;
      }

      if (!silent && failed.length > 0) {
        setError(failed.join(" · "));
      } else if (!silent) {
        setError(null);
      }

      const [l] = await Promise.allSettled([getLedger()]);
      const ledgerRes = pick(l, "ledger");
      if (ledgerRes) {
        setLedger(ledgerRes.records);
        setLedgerTotalCount(ledgerRes.totalCount ?? ledgerRes.records.length);
        if (ledgerRes.activityPayerAddresses?.length) {
          setActivityPayerAddresses(ledgerRes.activityPayerAddresses);
        }
      }

      if (!silent) {
        setRefreshTick((t) => t + 1);
        if (tab === "activity") {
          await loadActivityLedger("mine");
        }
      }

      if (!silent && csRes && !csRes.loggedIn) {
        void getCircleStatus()
          .then((full) => {
            setCircleStatus(full);
            savePayerDisplayCache(full);
          })
          .catch(() => undefined);
      }

      return !!(healthRes || csRes || asRes);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [tab, activityScope, loadActivityLedger]);

  const fundGateway = useCallback(async (opts?: { auto?: boolean }) => {
    const loggedIn = circleStatus?.loggedIn ?? !!loadPayerDisplayCache()?.loggedIn;
    const executor =
      circleStatus?.executorAddress ?? loadPayerDisplayCache()?.executorAddress ?? null;
    if (!loggedIn || !executor) {
      if (!opts?.auto) {
        const msg = "Log in with Circle (Payer) before funding Gateway.";
        setGatewayFundError(msg);
        if (isMobile) setMobileLoginOpen(true);
      }
      return;
    }
    if (gatewayFunding) return;
    setMobileMenuOpen(false);
    if (!opts?.auto) setGatewayFundError(null);
    setGatewayFunding(true);
    try {
      const result = await fundCircleWallet();
      if (result.gatewayBalanceUsdc != null) {
        setCircleStatus((prev) => {
          const next = prev
            ? { ...prev, gatewayBalanceUsdc: result.gatewayBalanceUsdc ?? prev.gatewayBalanceUsdc }
            : prev;
          if (next) savePayerDisplayCache(next);
          return next;
        });
      }
      for (let i = 0; i < 8; i++) {
        const cs = await getCircleStatusQuick().catch(() => null);
        if (cs) {
          setCircleStatus(cs);
          savePayerDisplayCache(cs);
          if (Number(cs.gatewayBalanceUsdc ?? 0) > 0) break;
        }
        await new Promise((r) => window.setTimeout(r, 2_500));
      }
      const latest = await getCircleStatusQuick().catch(() => null);
      if (!latest || Number(latest.gatewayBalanceUsdc ?? 0) <= 0) {
        if (!opts?.auto) {
          setGatewayFundError(
            "Funding may still be processing. Wait a minute, refresh the page, or try Fund account on Trace again."
          );
        }
      } else {
        setGatewayFundError(null);
      }
      void refresh({ quiet: true });
    } catch (e) {
      if (!opts?.auto) {
        setGatewayFundError(e instanceof Error ? e.message : "Could not fund Gateway");
      }
    } finally {
      setGatewayFunding(false);
    }
  }, [circleStatus?.loggedIn, circleStatus?.executorAddress, isMobile, gatewayFunding, refresh]);

  const maybeAutoFundGateway = useCallback(
    async (force = false) => {
      const loggedIn = circleStatus?.loggedIn ?? !!loadPayerDisplayCache()?.loggedIn;
      const executor =
        circleStatus?.executorAddress ?? loadPayerDisplayCache()?.executorAddress ?? null;
      const balance =
        circleStatus?.gatewayBalanceUsdc ??
        agentStatus?.gatewayBalanceUsdc ??
        loadPayerDisplayCache()?.gatewayBalanceUsdc ??
        null;
      if (!loggedIn || !executor) return;
      if (Number(balance ?? 0) > 0) return;
      const key = executor.toLowerCase();
      if (!force && autoFundExecutorRef.current === key) return;
      autoFundExecutorRef.current = key;
      await fundGateway({ auto: true });
    },
    [
      circleStatus?.loggedIn,
      circleStatus?.executorAddress,
      circleStatus?.gatewayBalanceUsdc,
      agentStatus?.gatewayBalanceUsdc,
      fundGateway,
    ]
  );

  const handlePayerLoginSuccess = useCallback((info?: { executorAddress: string | null; email?: string }) => {
    isolateBrowserSessionForPayer({
      email: info?.email ?? loadPayerDisplayCache()?.email,
      executorAddress: info?.executorAddress ?? null,
    });
    setActivityScope("mine");
    setCircleStatus((prev) => {
      const next = {
        installed: true,
        runnable: true,
        loggedIn: true,
        testnet: true,
        version: prev?.version ?? null,
        chain: prev?.chain ?? "ARC-TESTNET",
        email: info?.email ?? prev?.email,
        executorAddress: info?.executorAddress ?? prev?.executorAddress ?? null,
        gatewayBalanceUsdc: prev?.gatewayBalanceUsdc ?? null,
      };
      savePayerDisplayCache(next);
      return next;
    });
    void refresh({ quiet: true });
    void (async () => {
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => window.setTimeout(r, 3_000));
        const cs = await getCircleStatusQuick().catch(() => null);
        if (!cs) continue;
        if (!cs.loggedIn) continue;
        isolateBrowserSessionForPayer({ email: cs.email, executorAddress: cs.executorAddress });
        setCircleStatus(cs);
        savePayerDisplayCache(cs);
        if (Number(cs.gatewayBalanceUsdc ?? 0) > 0) return;
      }
      await maybeAutoFundGateway(true);
    })();
  }, [refresh, maybeAutoFundGateway]);

  const handleSignOut = useCallback(async () => {
    setMobileMenuOpen(false);
    clearPayerDisplayCache();
    clearPayerIdentityMarker();
    clearAllLibraryCaches();
    setCircleStatus((prev) =>
      prev ? { ...prev, loggedIn: false, executorAddress: null, email: undefined } : null
    );
    try {
      await circleLogout();
      resetBrowserSessionId();
      await refresh({ quiet: true });
    } catch {
      await refresh({ quiet: true });
    }
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setConnectSlow(true);
    }, 2_500);
    const forceShowTimer = window.setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
        setConnectSlow(false);
      }
    }, 4_000);

    void (async () => {
      try {
        const [h, cs] = await Promise.allSettled([getHealthQuick(), getCircleStatusQuick()]);
        if (!cancelled && h.status === "fulfilled") setHealth(h.value);
        if (!cancelled && cs.status === "fulfilled") {
          setCircleStatus(cs.value);
          savePayerDisplayCache(cs.value);
        }
      } catch {
        /* backend may be waking — show app anyway */
      }
      if (!cancelled) {
        setLoading(false);
        setConnectSlow(false);
        window.clearTimeout(forceShowTimer);
      }
      if (!cancelled) void refresh({ quiet: true });
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
      window.clearTimeout(forceShowTimer);
    };
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    void maybeAutoFundGateway();
  }, [loading, maybeAutoFundGateway]);

  useEffect(() => {
    if (loading) return;
    const id = setInterval(() => void refresh({ quiet: true }), 15_000);
    return () => clearInterval(id);
  }, [refresh, loading]);

  useEffect(() => {
    if (tab !== "activity") setSelectedActivity(null);
  }, [tab]);

  useEffect(() => {
    // Always keep Activity on the signed-in account — never switch to shared "all".
    if (activityScope !== "mine") setActivityScope("mine");
  }, [activityScope]);

  useEffect(() => {
    if (tab !== "activity") return;
    void loadActivityLedger("mine");
  }, [tab, loadActivityLedger]);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
      setMobileLoginOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileMenuOpen]);

  const goToTab = (id: Tab) => {
    setTab(id);
    setMobileMenuOpen(false);
  };

  const payerLoggedIn = circleStatus?.loggedIn ?? !!loadPayerDisplayCache()?.loggedIn;
  const payerExecutor =
    circleStatus?.executorAddress ?? loadPayerDisplayCache()?.executorAddress ?? null;
  const payerGatewayBalance =
    payerLoggedIn
      ? circleStatus?.gatewayBalanceUsdc ?? agentStatus?.gatewayBalanceUsdc ?? null
      : null;

  const payerReady =
    agentStatus?.canRun === true ||
    (payerLoggedIn &&
      !!payerExecutor &&
      (payerGatewayBalance == null || Number(payerGatewayBalance) > 0));

  const payerBlockReason =
    agentStatus?.canRun === false && agentStatus.reason
      ? agentStatus.reason
      : !payerLoggedIn
        ? "Log in with Circle (Payer) to pay agents via x402."
        : !payerExecutor
          ? "No Circle agent wallet found. Open Payer and select a wallet on ARC-TESTNET."
          : payerGatewayBalance != null && Number(payerGatewayBalance) <= 0
            ? gatewayFunding
              ? "Funding your Gateway account…"
              : "Gateway balance is $0 — funding starts automatically after login."
            : "Log in with Circle (Payer) before running tasks.";

  const handleRunWorkflow = async (etfId: string, brief?: string) => {
    if (!payerReady) {
      setWorkflowMessage(payerBlockReason);
      return;
    }
    setWorkflowRunning(true);
    setWorkflowMessage(null);
    try {
      const result = await apiRunMarketplaceWorkflow(etfId, brief);
      const orch = result.orchestration as {
        steps?: { ok: boolean; error?: string }[];
        totalUsdc?: string;
        mode?: string;
      };
      const steps = (orch.steps ?? []).filter((s): s is { ok: boolean; error?: string } => !!s);
      const ok = steps.filter((s) => s.ok).length;
      const total = steps.length;
      const firstErr = steps.find((s) => !s.ok)?.error;
      if (ok === total && total > 0) {
        setWorkflowMessage(
          `Workflow complete: ${ok}/${total} agents paid, $${orch.totalUsdc ?? "?"} USDC (${orch.mode})`
        );
      } else {
        setWorkflowMessage(
          firstErr
            ? `Payment failed (${ok}/${total} paid): ${formatWorkflowError(firstErr)}`
            : `Workflow incomplete: ${ok}/${total} agents paid`
        );
      }
      await refresh();
    } catch (e) {
      setWorkflowMessage(e instanceof Error ? e.message : "Workflow failed");
    } finally {
      setWorkflowRunning(false);
    }
  };

  const merchantLabel = (merchantId: string) => SERVICE_LABELS[merchantId] ?? merchantId;

  const userWallet = payerLoggedIn ? payerExecutor : null;

  const gatewayBalance = payerGatewayBalance;
  const gatewayLow = Number(gatewayBalance ?? 0) === 0;
  const gatewayChipValue = gatewayFunding
    ? "Funding…"
    : gatewayBalance != null
      ? `$${formatUsdc(gatewayBalance)}`
      : "—";

  const visibleActivityRecords = activityRecords;

  const activityCountLabel = `${visibleActivityRecords.length} for your account`;

  const showActivityLoading = activityLoading && visibleActivityRecords.length === 0;

  const primaryPayerLabel = userWallet || agentStatus?.circleExecutorAddress || activityPayerAddresses[0] || "";

  const activityWalletDesc = primaryPayerLabel
    ? `Only your Circle email · wallet ${shortAddr(primaryPayerLabel)} · ${activityCountLabel}`
    : null;

  const canFilterMine =
    !!userWallet ||
    activityPayerAddresses.length > 0 ||
    !!agentStatus?.circleExecutorAddress ||
    payerReady;

  const live = health?.mode !== "dev";

  if (loading) {
    return (
      <div className="app-shell">
        <div className="splash">
          <div className="splash-logo">
            <img src="/logo.png" alt="" className="splash-mark" width={44} height={44} />
            Butler
          </div>
          <div className="splash-spinner" />
          {connectSlow && (
            <p className="muted small" style={{ margin: 0, maxWidth: 280, textAlign: "center" }}>
              Connecting to Butler…
            </p>
          )}
        </div>
      </div>
    );
  }

  const activeNav = NAV.find((n) => n.id === tab)!;

  const accountLabel = payerLoggedIn
    ? circleStatus?.email
      ? shortEmail(circleStatus.email)
      : loadPayerDisplayCache()?.email
        ? shortEmail(loadPayerDisplayCache()!.email!)
        : userWallet
          ? shortAddr(userWallet)
          : "Connected"
    : "Sign in";

  return (
    <div
      className={`app-shell ${isMobile ? "is-mobile" : ""} ${tab === "agent" ? "app-shell--chat" : ""} ${tab === "library" ? "app-shell--library" : ""} ${tab === "activity" || tab === "trace" ? "app-shell--scroll-pane" : ""}`}
    >
      {!isMobile && (
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="" className="brand-mark" width={28} height={28} />
          <div>
            <strong>Butler</strong>
            <span>Agentic hub</span>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {NAV.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-item ${tab === id ? "active" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="sidebar-meta">
            <StatusDot live={live} />
            <span className="chain-tag">Arc · x402</span>
          </div>
        </div>
      </aside>
      )}

      {isMobile && (
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-header-brand"
          onClick={() => goToTab("agent")}
          aria-label="Butler home"
        >
          <img src="/logo.png" alt="" className="brand-mark" width={24} height={24} />
          <span className="mobile-header-title">Butler</span>
        </button>

        <button
          type="button"
          className={`mobile-header-pill account ${payerLoggedIn ? "connected" : ""}`}
          onClick={() => {
            if (payerLoggedIn) {
              setMobileMenuOpen(true);
            } else {
              setMobileLoginOpen(true);
            }
          }}
          aria-label={payerLoggedIn ? "Account and menu" : "Sign in with Circle"}
        >
          <IconWallet size={14} />
          <span className="mobile-header-pill-text">{accountLabel}</span>
        </button>

        <button
          type="button"
          className={`mobile-header-pill balance ${gatewayLow ? "warn" : ""}`}
          onClick={() => setMobileMenuOpen(true)}
          aria-label={`Gateway balance ${gatewayChipValue}`}
        >
          <span className="mobile-header-pill-label">GW</span>
          <span className="mobile-header-pill-text">{gatewayChipValue}</span>
        </button>

        <button
          type="button"
          className={`mobile-menu-toggle ${mobileMenuOpen ? "open" : ""}`}
          onClick={() => setMobileMenuOpen((v) => !v)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <IconClose size={20} /> : <IconMenu size={20} />}
        </button>
      </header>
      )}

      {isMobile && (
        <CircleLoginPanel
          variant="mobile-sheet"
          open={mobileLoginOpen}
          onOpenChange={setMobileLoginOpen}
          circleStatus={circleStatus}
          onReady={refresh}
          onLoginSuccess={(info) => {
            setMobileLoginOpen(false);
            handlePayerLoginSuccess(info);
          }}
        />
      )}

      {isMobile && mobileMenuOpen && (
        <>
          <button
            type="button"
            className="mobile-menu-backdrop"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="mobile-menu-panel" role="dialog" aria-label="Navigation menu">
            <div className="mobile-menu-account">
              <div className="mobile-menu-account-row">
                <IconWallet size={18} />
                <div className="mobile-menu-account-copy">
                  <strong>
                    {payerLoggedIn
                      ? circleStatus?.email ?? loadPayerDisplayCache()?.email ?? "Circle payer"
                      : "Not signed in"}
                  </strong>
                  {userWallet ? (
                    <span className="muted small mono" title={userWallet}>
                      {shortAddr(userWallet)}
                    </span>
                  ) : (
                    <span className="muted small">Log in to pay agents via x402</span>
                  )}
                </div>
              </div>
              <div className={`mobile-menu-balance ${gatewayLow ? "warn" : ""}`}>
                <div className="mobile-menu-balance-copy">
                  <span className="mobile-menu-balance-label">Gateway USDC</span>
                  <span className="mobile-menu-balance-value">{gatewayChipValue}</span>
                </div>
              </div>
            </div>

            <nav className="mobile-menu-nav" aria-label="Sections">
              {NAV.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  className={`mobile-menu-nav-item ${tab === id ? "active" : ""}`}
                  onClick={() => goToTab(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {tab === id && <span className="mobile-menu-nav-dot" aria-hidden />}
                </button>
              ))}
              {payerLoggedIn && (
                <button
                  type="button"
                  className="mobile-menu-nav-item sign-out"
                  onClick={() => void handleSignOut()}
                >
                  <IconWallet size={18} />
                  <span>Sign out</span>
                </button>
              )}
            </nav>

            <div className="mobile-menu-tools">
              <div className="mobile-menu-tools-row">
                <MetricChip label="Mode" value={live ? "Live" : "Dev"} variant={live ? "success" : "default"} />
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={refreshing}
                  onClick={() => {
                    void refresh();
                  }}
                >
                  <IconRefresh size={15} className={refreshing ? "spin" : undefined} />
                  Refresh
                </button>
              </div>
              <div className="mobile-menu-meta">
                <StatusDot live={live} />
                <span className="chain-tag">Arc · x402</span>
              </div>
            </div>
          </div>
        </>
      )}

      <main className={`main ${isMobile ? "main--mobile" : ""}`}>
        {!isMobile && (
        <header className="topbar">
          <div className="topbar-left">
            <nav className="topbar-crumb" aria-label="Breadcrumb">
              <span className="topbar-crumb-root">Butler</span>
              <span className="topbar-crumb-sep" aria-hidden>/</span>
              <span className="topbar-crumb-current">{activeNav.label}</span>
            </nav>
            {userWallet ? (
              <span className="topbar-meta">
                Wallet <code title={userWallet}>{shortAddr(userWallet)}</code>
              </span>
            ) : null}
          </div>

          <div className="topbar-right">
            <div className="toolbar">
              <MetricChip
                label="Gateway"
                value={gatewayChipValue}
                variant={gatewayLow ? "warning" : "default"}
                accent
              />
              <CircleLoginPanel
                variant="toolbar"
                circleStatus={circleStatus}
                onReady={refresh}
                onLoginSuccess={handlePayerLoginSuccess}
              />
              <MetricChip label="Mode" value={live ? "Live" : "Dev"} variant={live ? "success" : "default"} />
            </div>

            <span className="toolbar-sep" aria-hidden />

            <div className="toolbar-actions">
              <button
                type="button"
                className="btn icon-btn"
                disabled={refreshing}
                onClick={() => void refresh()}
                title="Refresh"
                aria-label="Refresh"
              >
                <IconRefresh size={15} className={refreshing ? "spin" : undefined} />
              </button>
            </div>
          </div>
        </header>
        )}

        <div className={`main-inner ${tab === "activity" || tab === "trace" ? "main-inner--scroll-pane" : ""}`}>
          {workflowMessage && tab === "marketplace" && (
            <div
              className={`inline-alert ${
                workflowMessage.startsWith("Workflow complete") ? "success" : ""
              }`}
            >
              {workflowMessage}
            </div>
          )}

          {butlerBusy && (tab === "agent" || tab === "marketplace") && (
            <div className="inline-alert info">
              <strong>Butler is running</strong> — auctions and x402 payments can take several minutes. Keep this tab
              open; your deliverable will appear in Library when finished.
            </div>
          )}

          {tab === "agent" && (
            <AgentChatView
              canRun={payerReady}
              payerReason={payerBlockReason}
              onTaskComplete={refresh}
              onButlerBusyChange={setButlerBusy}
              onViewDeliverable={(jobId) => {
                setLibraryJobId(jobId);
                setTab("library");
              }}
            />
          )}

          {tab === "library" && (
            <DeliverablesView
              selectedId={libraryJobId}
              onSelectId={setLibraryJobId}
              refreshKey={refreshTick}
              payerLoggedIn={payerLoggedIn}
            />
          )}

          {tab === "marketplace" && (
            <MarketplaceView
              onRunWorkflow={handleRunWorkflow}
              workflowRunning={workflowRunning}
              onViewDeliverable={(jobId) => {
                setLibraryJobId(jobId);
                setTab("library");
              }}
            />
          )}

          {tab === "activity" && (
            <div className="activity-view">
            <Panel
              title="Your payments"
              desc={
                activityWalletDesc ??
                (primaryPayerLabel
                  ? `Only your Circle account · wallet ${shortAddr(primaryPayerLabel)} · ${activityCountLabel}`
                  : `Only payments for your signed-in email · ${activityCountLabel}`)
              }
              className="activity-panel-mine"
              action={
                <div className="panel-head-actions">
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => void loadActivityLedger("mine")}
                    aria-label="Refresh ledger"
                  >
                    <IconRefresh size={15} />
                  </button>
                </div>
              }
            >
              {showActivityLoading ? (
                <div className="activity-loading muted">Loading payments…</div>
              ) : visibleActivityRecords.length === 0 ? (
                <EmptyState
                  title="No payments yet"
                  body={
                    canFilterMine
                      ? "Activity shows only tasks you paid for with this Circle email. Library and traces are private to your account."
                      : "Log in with Circle (Payer) to see activity for your email only."
                  }
                />
              ) : (
                <div className="table-wrap">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Agent</th>
                        <th>Service</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Settlement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleActivityRecords.map((r) => (
                        <tr
                          key={r.id}
                          className={`ledger-row ${r.status === "blocked" ? "dim" : ""} ${selectedActivity?.id === r.id ? "selected" : ""}`}
                          onClick={() => setSelectedActivity(r)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSelectedActivity(r);
                            }
                          }}
                          tabIndex={0}
                          role="button"
                          aria-label={`View payment ${merchantLabel(r.merchantId)} ${formatUsdc(r.amountUsdc)} USDC`}
                        >
                          <td>{new Date(r.at * 1000).toLocaleString()}</td>
                          <td className="capitalize">{r.agent}</td>
                          <td>{merchantLabel(r.merchantId)}</td>
                          <td className="mono">${formatUsdc(r.amountUsdc)}</td>
                          <td>
                            <span className={`pill ${r.status}`}>{r.status}</span>
                          </td>
                          <td className="mono dim-cell">
                            {r.settlementId ? shortAddr(r.settlementId) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
            {selectedActivity && (
              <ActivityDetail
                record={selectedActivity}
                serviceLabel={merchantLabel(selectedActivity.merchantId)}
                sellerAddress={health?.seller ?? agentStatus?.sellerAddress}
                isMobile={isMobile}
                onClose={() => setSelectedActivity(null)}
                onOpenTrace={(id) => {
                  setSelectedActivity(null);
                  setTraceSettlementId(id);
                  setTab("trace");
                }}
              />
            )}
            </div>
          )}

          {tab === "trace" && (
            <PaymentTrace
              initialId={traceSettlementId || ledger.find((r) => r.settlementId)?.settlementId || ""}
              sellerAddress={health?.seller ?? agentStatus?.sellerAddress}
              recentSettlements={[
                ...new Set(
                  activityRecords
                    .map((r) => r.settlementId)
                    .filter((id): id is string => !!id)
                ),
              ]}
              needsGatewayFund={payerLoggedIn && gatewayLow}
              gatewayFunding={gatewayFunding}
              gatewayFundError={gatewayFundError}
              onFundGateway={() => void fundGateway()}
            />
          )}
        </div>
      </main>
    </div>
  );
}
