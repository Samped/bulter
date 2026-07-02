import { randomUUID } from "node:crypto";

export type CircleFundJobResult = {
  ok: boolean;
  address: string;
  chain: string;
  gatewayBalanceUsdc?: string | null;
  walletFund?: { ok: boolean; message?: string; error?: string };
  gatewayDeposit?: { ok: boolean; message?: string; error?: string };
  error?: string;
};

type FundJob = {
  status: "pending" | "ok" | "error";
  startedAt: number;
  result?: CircleFundJobResult;
  error?: string;
};

const jobs = new Map<string, FundJob>();
const JOB_TTL_MS = 15 * 60 * 1000;

function pruneJobs(): void {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.startedAt < cutoff) jobs.delete(id);
  }
}

export function startCircleFundJob(
  run: () => Promise<CircleFundJobResult>
): { jobId: string } {
  pruneJobs();
  const jobId = randomUUID();
  const job: FundJob = { status: "pending", startedAt: Date.now() };
  jobs.set(jobId, job);
  void run()
    .then((result) => {
      const current = jobs.get(jobId);
      if (!current) return;
      current.status = result.ok ? "ok" : "error";
      current.result = result;
      current.error = result.ok ? undefined : result.error ?? "Gateway funding failed";
    })
    .catch((err) => {
      const current = jobs.get(jobId);
      if (!current) return;
      current.status = "error";
      current.error = err instanceof Error ? err.message : "Gateway funding failed";
    });
  return { jobId };
}

export function getCircleFundJob(jobId: string): FundJob | null {
  pruneJobs();
  return jobs.get(jobId) ?? null;
}
