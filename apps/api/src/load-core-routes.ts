/**
 * Fast-boot routes (Circle login, config). Loaded synchronously before heavy x402/marketplace routes.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Express } from "express";
import { GATEWAY_FACILITATOR, resolveArcRpc, ARC_EIP155 } from "@butler/arc";
import {
  circleCliInstalled,
  circleCliLoggedIn,
  circleGatewayBalance,
  circleListAgentWallets,
  circleLogout,
  circleVersion,
  ensureCircleExecutor,
  fundCircleAgentAfterLogin,
  getGatewayBalanceForApi,
  invalidateCircleCache,
  probeCircleCli,
  resetGatewayInternalDebit,
  scheduleGatewayBalanceRefresh,
} from "./circle-cli.ts";
import { getCircleFundJob, startCircleFundJob } from "./circle-fund-jobs.ts";
import { loadCircleConfig, resolveCircleExecutorAddress, resolveCircleChain, saveCircleConfig, clearCircleConfig } from "./circle-config.ts";
import { resolveButlerStatePath } from "./data-paths.ts";
import { registerRegistryRoutes } from "./registry-routes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const WEB_URL = process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5174}`;
const SELLER = (process.env.BUTLER_SELLER_ADDRESS ?? "0x933a2405f84c224be1ef373ba16e992e1f459682") as `0x${string}`;

function resolveApiBase(): string {
  const configured = process.env.BUTLER_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `http://127.0.0.1:${PORT}`;
}

export function loadCoreRoutes(app: Express): void {
  /** Agent catalog — available before x402 gateway warm (Auctions → Agent network). */
  registerRegistryRoutes(app, {
    apiBase: resolveApiBase(),
    statePath: resolveButlerStatePath(),
    sellerAddress: SELLER,
  });

  app.get("/api/config", (_req, res) => {
    res.json({
      chain: ARC_EIP155,
      chainId: 5042002,
      seller: process.env.BUTLER_SELLER_ADDRESS ?? "0x933a2405f84c224be1ef373ba16e992e1f459682",
      arcRpc: resolveArcRpc(),
      gateway: process.env.GATEWAY_FACILITATOR_URL ?? GATEWAY_FACILITATOR,
      webUrl: WEB_URL,
    });
  });

  app.get("/api/circle/status", (_req, res) => {
    try {
      const cfg = loadCircleConfig();
      const probe = probeCircleCli();
      const installed = circleCliInstalled();
      let executor = resolveCircleExecutorAddress();
      if (!executor && probe.loggedIn) {
        void Promise.resolve().then(() => ensureCircleExecutor());
      }
      const gatewayBalanceUsdc = getGatewayBalanceForApi(executor);
      res.json({
        installed,
        runnable: installed || probe.runnable,
        loggedIn: probe.loggedIn,
        testnet: probe.testnet ?? true,
        version: circleVersion(),
        executorAddress: executor,
        email: cfg.email ?? probe.email,
        chain: cfg.chain ?? resolveCircleChain(),
        gatewayBalanceUsdc,
        session: probe.raw,
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Circle status failed" });
    }
  });

  app.post("/api/circle/logout", (_req, res) => {
    try {
      invalidateCircleCache();
      clearCircleConfig();
      const result = circleLogout();
      if (!result?.ok) {
        console.warn("[circle/logout] CLI logout:", result?.error ?? "unknown");
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Logout failed" });
    }
  });

  app.get("/api/circle/wallets", (_req, res) => {
    if (!circleCliLoggedIn()) {
      res.status(401).json({ error: "Not logged in to Circle CLI" });
      return;
    }
    const chain = resolveCircleChain();
    res.json({
      chain,
      wallets: circleListAgentWallets(chain),
      executorAddress: ensureCircleExecutor() ?? resolveCircleExecutorAddress(),
    });
  });

  app.post("/api/circle/fund", (_req, res) => {
    try {
      if (!circleCliLoggedIn()) {
        res.status(401).json({ error: "Log in to Circle first" });
        return;
      }
      const executor = ensureCircleExecutor() ?? resolveCircleExecutorAddress();
      if (!executor) {
        res.status(400).json({ error: "No agent wallet found" });
        return;
      }
      const chain = resolveCircleChain();
      const { jobId } = startCircleFundJob(async () => {
        const result = await fundCircleAgentAfterLogin(executor, chain);
        resetGatewayInternalDebit();
        const gatewayBalanceUsdc = getGatewayBalanceForApi(executor) ?? loadCircleConfig().gatewayBalanceUsdc;
        const depositOk = result.gatewayDeposit?.ok ?? false;
        const ok = result.walletFund.ok && depositOk;
        const error =
          result.gatewayDeposit?.error ??
          result.walletFund.error ??
          (!depositOk ? "Gateway deposit did not complete" : undefined);
        return {
          ok,
          address: executor,
          chain,
          gatewayBalanceUsdc,
          walletFund: result.walletFund,
          gatewayDeposit: result.gatewayDeposit,
          error,
        };
      });
      res.status(202).json({ pending: true, jobId, address: executor, chain });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Fund failed" });
    }
  });

  app.get("/api/circle/fund/:jobId", (req, res) => {
    const job = getCircleFundJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Fund job not found or expired — try again." });
      return;
    }
    if (job.status === "pending") {
      res.json({ status: "pending", elapsedMs: Date.now() - job.startedAt });
      return;
    }
    if (job.status === "error") {
      res.json({
        status: "error",
        ok: false,
        error: job.error ?? job.result?.error ?? "Gateway funding failed",
        address: job.result?.address,
        chain: job.result?.chain,
        walletFund: job.result?.walletFund,
        gatewayDeposit: job.result?.gatewayDeposit,
      });
      return;
    }
    res.json({ status: "ok", ok: true, ...job.result });
  });

  app.post("/api/circle/executor", (req, res) => {
    const address = String(req.body?.address ?? "").trim();
    if (!address.startsWith("0x")) {
      res.status(400).json({ error: "address required" });
      return;
    }
    const cfg = saveCircleConfig({
      executorAddress: address as `0x${string}`,
      chain: (req.body?.chain as string) ?? resolveCircleChain(),
    });
    res.json({ ok: true, executorAddress: cfg.executorAddress, chain: cfg.chain });
  });

  app.get("/api/circle/gateway/balance", (req, res) => {
    try {
      const address = String(req.query.address ?? resolveCircleExecutorAddress() ?? "");
      if (!address.startsWith("0x")) {
        res.status(400).json({ error: "address required" });
        return;
      }
      if (!circleCliLoggedIn()) {
        res.status(401).json({ error: "Circle login required" });
        return;
      }
      scheduleGatewayBalanceRefresh(address);
      const cached = getGatewayBalanceForApi(address);
      if (cached != null) {
        res.json({ data: { total: cached, token: "USDC", address, cached: true } });
        return;
      }
      const chain = String(req.query.chain ?? resolveCircleChain());
      const bal = circleGatewayBalance(address, chain);
      if (!bal?.ok) {
        res.status(500).json({ error: bal?.error ?? "Balance lookup failed" });
        return;
      }
      try {
        res.json(JSON.parse(bal.raw ?? "{}"));
      } catch {
        res.json({ raw: bal.raw });
      }
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Balance lookup failed" });
    }
  });

  console.log(`  core routes: Circle · config · agent catalog (${PORT})`);
}
