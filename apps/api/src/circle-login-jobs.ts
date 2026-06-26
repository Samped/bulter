import { randomUUID } from "node:crypto";

export type CircleLoginInitResult = {
  ok: boolean;
  requestId?: string;
  email?: string;
  message?: string;
  otpPrefix?: string;
  error?: string;
};

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
      const { circleCliInstalled, circleLoginInitAsync } = await import("./circle-cli.ts");
      if (!circleCliInstalled()) {
        fail(jobId, "Circle CLI not installed on the server. Redeploy the API on Render.");
        return;
      }
      const result = await circleLoginInitAsync(email, testnet, 120_000);
      const job = jobs.get(jobId);
      if (!job) return;
      job.status = result.ok ? "ok" : "error";
      job.result = result;
    } catch (error) {
      fail(jobId, error instanceof Error ? error.message : "Failed to send OTP");
    }
  })();
  return jobId;
}

function fail(jobId: string, error: string): void {
  const job = jobs.get(jobId);
  if (!job) return;
  job.status = "error";
  job.result = { ok: false, error };
}

export function getCircleLoginInitJob(jobId: string): LoginInitJob | undefined {
  return jobs.get(jobId);
}
