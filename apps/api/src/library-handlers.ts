import {
  loadMarketplaceState,
  saveMarketplaceState,
  type MarketplaceJob,
} from "@butler/core";
import {
  backfillJobsForOwner,
  resolveJobOwnerFromRequest,
  type JobOwner,
} from "./job-owner.ts";
import type { Request, Response } from "express";

const LIBRARY_STATUSES = new Set<MarketplaceJob["status"]>([
  "completed",
  "running",
  "paying",
  "pending",
  "failed",
]);

export function libraryJobsForOwner(
  statePath: string,
  sellerAddress: `0x${string}`,
  owner: JobOwner
): { jobs: MarketplaceJob[]; persisted: boolean } {
  const state = loadMarketplaceState(statePath, sellerAddress);
  const candidates = state.jobs.filter((j) => LIBRARY_STATUSES.has(j.status));
  const { jobs, updated } = backfillJobsForOwner(candidates, owner);
  if (updated.length > 0) {
    const map = new Map(state.jobs.map((j) => [j.id, j]));
    for (const row of updated) map.set(row.id, row);
    saveMarketplaceState({ ...state, jobs: Array.from(map.values()) }, statePath);
    return { jobs, persisted: true };
  }
  return { jobs, persisted: false };
}

export async function handleListDeliverables(
  req: Request,
  res: Response,
  statePath: string,
  sellerAddress: `0x${string}`
): Promise<void> {
  const owner = resolveJobOwnerFromRequest(req);
  const { jobs } = libraryJobsForOwner(statePath, sellerAddress, owner);
  const { buildJobSummary, inferPlanFromJob } = await import("./marketplace-task.ts");
  const rows = jobs
    .slice(-100)
    .reverse()
    .map((j) => {
      try {
        return {
          ...j,
          plan: j.plan ?? inferPlanFromJob(j),
          summary: buildJobSummary(j),
        };
      } catch (err) {
        return {
          ...j,
          plan: j.plan ?? inferPlanFromJob(j),
          summary: j.summary ?? (err instanceof Error ? err.message : "Summary unavailable"),
        };
      }
    });
  res.json(rows);
}

export async function handleGetDeliverable(
  req: Request,
  res: Response,
  statePath: string,
  sellerAddress: `0x${string}`
): Promise<void> {
  const owner = resolveJobOwnerFromRequest(req);
  const state = loadMarketplaceState(statePath, sellerAddress);
  const job = state.jobs.find((j) => j.id === req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const { jobs } = backfillJobsForOwner([job], owner);
  const visible = jobs[0];
  if (!visible) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const { buildJobSummary, inferPlanFromJob } = await import("./marketplace-task.ts");
  res.json({
    ...visible,
    plan: visible.plan ?? inferPlanFromJob(visible),
    summary: buildJobSummary(visible),
  });
}
