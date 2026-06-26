import { randomUUID } from "node:crypto";
import { circleCliInstalled, circleCliQuickRunnable, circleLoginInitAsync, type CircleLoginInitResult } from "./circle-cli.ts";

type LoginInitJob = {
  status: "pending" | "ok" | "error";
  email: string;
  testnet: boolean;
  result?: CircleLoginInitResult;
  startedAt: number;
};

const jobs = new Map<string, LoginInitJob>();
const JOB_TTL_MS = 30 * 60 * 1000;

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
}

export function startCircleLoginInitJob(email: string, testnet = true): string {
  pruneJobs();
  const jobId = randomUUID();
  jobs.set(jobId, { status: "pending", email, testnet, startedAt: Date.now() });
  void (async () => {
    try {
      if (!circleCliInstalled()) {
        const job = jobs.get(jobId);
        if (!job) return;
        job.status = "error";
        job.result = { ok: false, error: "Circle CLI not installed on the server." };
        return;
      }
      if (!circleCliQuickRunnable()) {
        const job = jobs.get(jobId);
        if (!job) return;
        job.status = "error";
        job.result = {
          ok: false,
          error: "Circle CLI is installed but not responding. Try again in a moment.",
        };
        return;
      }
      const result = await circleLoginInitAsync(email, testnet, 120_000);
      const job = jobs.get(jobId);
      if (!job) return;
      job.status = result.ok ? "ok" : "error";
      job.result = result;
    } catch (error) {
      const job = jobs.get(jobId);
      if (!job) return;
      job.status = "error";
      job.result = {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to send OTP",
      };
    }
  })();
  return jobId;
}

export function getCircleLoginInitJob(jobId: string): LoginInitJob | undefined {
  return jobs.get(jobId);
}
