import type { Express } from "express";
import { getCircleLoginInitJob, startCircleLoginInitJob } from "./circle-login-jobs.ts";

/** Minimal login routes — no circle-cli import so POST /init returns instantly. */
export function registerCircleLoginRoutes(app: Express): void {
  app.post("/api/circle/login/init", (req, res) => {
    try {
      const email = String(req.body?.email ?? "").trim();
      if (!email.includes("@")) {
        res.status(400).json({ error: "Valid email required" });
        return;
      }
      const testnet = req.body?.testnet !== false;
      const jobId = startCircleLoginInitJob(email, testnet);
      res.status(202).json({ pending: true, jobId, email });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to send OTP",
      });
    }
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
      res.status(500).json({ status: "error", error: result?.error ?? "Failed to send OTP", elapsedMs });
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
}
