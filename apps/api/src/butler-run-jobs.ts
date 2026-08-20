import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ButlerResult } from "./butler.ts";

const JOBS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.data/butler-run-jobs");
const JOB_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_RUN_TIMEOUT_MS = 300_000;
/** Full ETF pipelines on small VMs — keep under 8 minutes so the UI isn't stuck forever. */
const ETF_RUN_TIMEOUT_MS = 480_000;

function runTimeoutMs(params: ButlerRunParams): number {
  if (params.auctionMode === "etf" || params.qualityTier === "full") return ETF_RUN_TIMEOUT_MS;
  return DEFAULT_RUN_TIMEOUT_MS;
}

export type ButlerRunParams = {
  brief: string;
  apiBase: string;
  statePath: string;
  sellerAddress: string;
  strategy?: "auction" | "direct";
  category?: string;
  minReputation?: number;
  ttlSeconds?: number;
  qualityTier?: string;
  maxBudgetUsdc?: string;
  auctionMode?: "etf" | "single";
  forceX402?: boolean;
  sessionId?: string;
};

type ButlerRunJob = {
  status: "pending" | "running" | "ok" | "error";
  startedAt: number;
  params: ButlerRunParams;
  result?: ButlerResult;
  error?: string;
};

const jobs = new Map<string, ButlerRunJob>();
/** runIds that currently have an in-process worker */
const activeWorkers = new Set<string>();

function jobPath(runId: string): string {
  return join(JOBS_DIR, `${runId}.json`);
}

function ensureJobsDir(): void {
  mkdirSync(JOBS_DIR, { recursive: true });
}

function saveJob(runId: string, job: ButlerRunJob): void {
  ensureJobsDir();
  jobs.set(runId, job);
  writeFileSync(jobPath(runId), JSON.stringify(job), "utf8");
}

function loadJobFromDisk(runId: string): ButlerRunJob | undefined {
  const path = jobPath(runId);
  if (!existsSync(path)) return undefined;
  try {
    const job = JSON.parse(readFileSync(path, "utf8")) as ButlerRunJob;
    if (Date.now() - job.startedAt > JOB_TTL_MS) {
      unlinkSync(path);
      return undefined;
    }
    jobs.set(runId, job);
    return job;
  } catch {
    return undefined;
  }
}

function updateJob(runId: string, patch: Partial<ButlerRunJob>): void {
  const job = jobs.get(runId) ?? loadJobFromDisk(runId);
  if (!job) return;
  Object.assign(job, patch);
  saveJob(runId, job);
}

/** Mark orphaned running jobs (no live worker) as errors so the UI stops spinning. */
function failZombieJob(runId: string, job: ButlerRunJob, reason: string): ButlerRunJob {
  if (job.status !== "pending" && job.status !== "running") return job;
  if (activeWorkers.has(runId)) return job;
  const next = { ...job, status: "error" as const, error: reason };
  saveJob(runId, next);
  return next;
}

function runWorker(runId: string, params: ButlerRunParams): void {
  if (activeWorkers.has(runId)) return;
  activeWorkers.add(runId);

  const work = async () => {
    updateJob(runId, { status: "running" });
    try {
      const { runButler } = await import("./butler.ts");
      const timeoutMs = runTimeoutMs(params);
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`Butler run timed out after ${Math.round(timeoutMs / 60_000)} minutes`)),
          timeoutMs
        );
      });
      const result = await Promise.race([
        runButler({
          brief: params.brief,
          apiBase: params.apiBase,
          statePath: params.statePath,
          sellerAddress: params.sellerAddress,
          strategy: params.strategy,
          category: params.category,
          minReputation: params.minReputation,
          ttlSeconds: params.ttlSeconds,
          qualityTier: params.qualityTier as import("@butler/core").QualityTier | undefined,
          maxBudgetUsdc: params.maxBudgetUsdc,
          auctionMode: params.auctionMode,
          forceX402: params.forceX402,
          sessionId: params.sessionId,
        }),
        timeout,
      ]);
      if (!result?.ok) {
        updateJob(runId, {
          status: "error",
          result,
          error: result?.error ?? "Butler returned no result",
        });
        return;
      }
      updateJob(runId, { status: "ok", result });
    } catch (error) {
      updateJob(runId, {
        status: "error",
        error: error instanceof Error ? error.message : "Butler failed",
      });
    } finally {
      activeWorkers.delete(runId);
    }
  };

  void (async () => {
    if (params.sessionId) {
      const { runWithUserSessionAsync } = await import("./user-session.ts");
      await runWithUserSessionAsync(params.sessionId, work);
    } else {
      await work();
    }
  })();
}

export function startButlerRunJob(params: ButlerRunParams): string {
  const runId = randomUUID();
  saveJob(runId, { status: "pending", startedAt: Date.now(), params });
  setImmediate(() => runWorker(runId, params));
  return runId;
}

export function getButlerRunJob(runId: string): ButlerRunJob | undefined {
  const job = jobs.get(runId) ?? loadJobFromDisk(runId);
  if (!job) return undefined;
  if (job.status === "pending" || job.status === "running") {
    const age = Date.now() - job.startedAt;
    const limit = runTimeoutMs(job.params) + 30_000;
    if (!activeWorkers.has(runId) && age > 15_000) {
      return failZombieJob(
        runId,
        job,
        "Task was interrupted when the server restarted. Tap send again to retry."
      );
    }
    if (age > limit) {
      return failZombieJob(
        runId,
        job,
        `Butler run timed out after ${Math.round(limit / 60_000)} minutes`
      );
    }
  }
  return job;
}

/** On boot: fail orphaned running jobs so the UI doesn't spin forever. */
export function pruneButlerRunJobs(): void {
  ensureJobsDir();
  const cutoff = Date.now() - JOB_TTL_MS;
  try {
    for (const name of readdirSync(JOBS_DIR)) {
      if (!name.endsWith(".json")) continue;
      const runId = name.replace(/\.json$/, "");
      const job = loadJobFromDisk(runId);
      if (!job) continue;
      if (job.startedAt < cutoff) {
        jobs.delete(runId);
        try {
          unlinkSync(jobPath(runId));
        } catch {
          /* ignore */
        }
        continue;
      }
      if (job.status === "pending" || job.status === "running") {
        failZombieJob(
          runId,
          job,
          "Task was interrupted when the server restarted. Tap send again to retry."
        );
      }
    }
  } catch {
    /* ignore */
  }
}
