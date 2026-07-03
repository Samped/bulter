import type { Express } from "express";
import { getCircleLoginInitJob, startCircleLoginInitJob } from "./circle-login-jobs.ts";
import { getUserSessionPaths } from "./user-session.ts";

/** Minimal login routes — registered before heavy imports so init/verify respond immediately. */
export function registerCircleLoginRoutes(app: Express): void {
  app.post("/api/circle/login/init", (req, res) => {
    void handleLoginInit(req, res);
  });

  app.get("/api/circle/login/init/:jobId", (req, res) => {
    const job = getCircleLoginInitJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Login job not found or expired — send a new code." });
      return;
    }
    const elapsedMs = Date.now() - job.startedAt;
    if (job.status === "pending") {
      res.json({ status: "pending", email: job.email, elapsedMs });
      return;
    }
    const result = job.result;
    if (!result?.ok) {
      res.json({ status: "error", error: result?.error ?? "Failed to send OTP", elapsedMs });
      return;
    }
    res.json({
      status: "ok",
      ok: true,
      requestId: result.requestId,
      email: result.email,
      message: result.message,
      otpPrefix: result.otpPrefix,
      hint: result.otpPrefix
        ? `Enter ${result.otpPrefix}-123456 or the 6 digits from your email (one verify attempt per code).`
        : "Check your email for a code like B1X-123456 (6 digits also works). One verify attempt per code.",
      elapsedMs,
    });
  });

  app.post("/api/circle/login/verify", (req, res) => {
    void handleLoginVerify(req, res);
  });
}

async function handleLoginInit(
  req: { body?: Record<string, unknown> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    json: (body: unknown) => void;
  }
): Promise<void> {
  try {
    const email = String(req.body?.email ?? "").trim();
    if (!email.includes("@")) {
      res.status(400).json({ error: "Valid email required" });
      return;
    }
    const testnet = req.body?.testnet !== false;
    const useSync = process.env.BUTLER_SYNC_LOGIN_INIT === "true";

    if (useSync) {
      const { circleCliInstalled, circleLoginInitAsync } = await import("./circle-cli.ts");
      if (!circleCliInstalled()) {
        res.status(500).json({ error: "Circle CLI not installed on the server. Redeploy the API." });
        return;
      }
      const result = await circleLoginInitAsync(email, testnet, 120_000);
      if (!result.ok || !result.requestId) {
        res.status(500).json({ error: result.error ?? "Failed to send OTP" });
        return;
      }
      const { backupLoginRequestSession } = await import("./circle-login-session.ts");
      backupLoginRequestSession(result.requestId);
      res.json({
        ok: true,
        requestId: result.requestId,
        email: result.email ?? email,
        message: result.message,
        otpPrefix: result.otpPrefix,
        hint: result.otpPrefix
          ? `Enter ${result.otpPrefix}-123456 or the 6 digits from your email (one verify attempt per code).`
          : "Check your email for a code like B1X-123456 (6 digits also works). One verify attempt per code.",
      });
      return;
    }

    const sessionId = getUserSessionPaths()?.sessionId;
    const jobId = startCircleLoginInitJob(email, testnet, sessionId);
    res.status(202).json({ pending: true, jobId, email });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to send OTP",
    });
  }
}

async function handleLoginVerify(
  req: { body?: Record<string, unknown> },
  res: {
    status: (code: number) => { json: (body: unknown) => void };
    json: (body: unknown) => void;
  }
): Promise<void> {
  try {
    const requestId = String(req.body?.requestId ?? "").trim();
    const otp = String(req.body?.otp ?? "").trim();
    if (!requestId || !otp) {
      res.status(400).json({ error: "requestId and otp required" });
      return;
    }
    const emailHint = String(req.body?.email ?? "").trim();
    const otpPrefixHint = String(req.body?.otpPrefix ?? "").trim();
    const testnet = req.body?.testnet !== false;
    const { circleLoginVerifyAsync, circleListAgentWalletsAsync } = await import("./circle-cli.ts");
    const { saveCircleConfig, resolveCircleExecutorAddress, resolveCircleChain } = await import(
      "./circle-config.ts"
    );
    const verifyTimeout = 55_000;
    const result = await circleLoginVerifyAsync(
      requestId,
      otp,
      testnet,
      verifyTimeout,
      otpPrefixHint || undefined
    );
    if (!result?.ok) {
      const errMsg = result?.error ?? "Login failed";
      const rateLimited = /429|rate.?limit|too many requests|<!doctype/i.test(errMsg);
      res.status(rateLimited ? 429 : 401).json({
        error: errMsg,
        needsNewCode: result?.needsNewCode ?? rateLimited,
      });
      return;
    }
    const savedEmail = result.email ?? (emailHint.includes("@") ? emailHint : undefined);
    if (savedEmail) saveCircleConfig({ email: savedEmail });
    const chain = resolveCircleChain();
    const wallets = await circleListAgentWalletsAsync(chain, 20_000);
    const first = wallets[0]?.address as `0x${string}` | undefined;
    if (first) {
      saveCircleConfig({ executorAddress: first, chain });
    }
    const executor = resolveCircleExecutorAddress() ?? first ?? null;
    if (executor) {
      const { fundCircleAgentAfterLogin, getGatewayBalanceForApi } = await import("./circle-cli.ts");
      const balance = getGatewayBalanceForApi(executor);
      if (balance == null || Number(balance) === 0) {
        void fundCircleAgentAfterLogin(executor, chain).catch((err) => {
          console.error("[circle/login/auto-fund]", err instanceof Error ? err.message : err);
        });
      }
    }
    res.json({
      ok: true,
      email: savedEmail ?? result.email,
      message: result.message,
      wallets,
      executorAddress: executor,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Login verify failed",
      needsNewCode: true,
    });
  }
}
