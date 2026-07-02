import type { MarketplaceJob, ReverseAuction } from "@butler/core";
import type { Request } from "express";
import { loadCircleConfig, resolveCircleExecutorAddress } from "./circle-config.ts";
import { sessionIdFromRequest } from "./user-session.ts";

export type JobOwner = {
  sessionId?: string;
  payerAddress?: string;
  gatewayPayerAddress?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function primaryOwnerPayerAddress(): `0x${string}` | undefined {
  const cfg = loadCircleConfig();
  const gateway = cfg.gatewayPayerAddress?.startsWith("0x") ? cfg.gatewayPayerAddress : undefined;
  const executor = resolveCircleExecutorAddress() ?? undefined;
  return (gateway ?? executor) as `0x${string}` | undefined;
}

export function resolveJobOwnerFromSession(sessionId?: string): JobOwner {
  const cfg = loadCircleConfig();
  const executor = resolveCircleExecutorAddress() ?? undefined;
  const gateway = cfg.gatewayPayerAddress?.startsWith("0x") ? cfg.gatewayPayerAddress : undefined;
  return {
    sessionId,
    payerAddress: executor,
    gatewayPayerAddress: gateway,
  };
}

export function resolveJobOwnerFromRequest(req: Request): JobOwner {
  const sessionId = sessionIdFromRequest(req) ?? undefined;
  return resolveJobOwnerFromSession(sessionId);
}

/** Wallet + Gateway payer addresses for the connected session. */
export function resolveOwnerPayerAddresses(owner: JobOwner): string[] {
  const set = new Set<string>();
  if (owner.payerAddress) set.add(owner.payerAddress.toLowerCase());
  if (owner.gatewayPayerAddress) set.add(owner.gatewayPayerAddress.toLowerCase());
  return [...set];
}

function ownerHasIdentity(owner: JobOwner): boolean {
  return !!owner.sessionId || resolveOwnerPayerAddresses(owner).length > 0;
}

export function extractJobPaidBy(job: MarketplaceJob): string | undefined {
  if (job.payerAddress?.trim()) return job.payerAddress.trim();
  for (const step of job.steps) {
    const output = asRecord(step.output);
    if (!output) continue;
    const response = asRecord(output.response);
    const paid =
      (typeof response?.paid_by === "string" ? response.paid_by : undefined) ??
      (typeof output.paid_by === "string" ? output.paid_by : undefined);
    if (paid?.trim()) return paid.trim();
  }
  return undefined;
}

function jobPayerMatchesOwner(job: MarketplaceJob, owner: JobOwner): boolean {
  const paidBy = extractJobPaidBy(job);
  const addrs = resolveOwnerPayerAddresses(owner);
  if (!paidBy || addrs.length === 0) return false;
  return addrs.includes(paidBy.toLowerCase());
}

export function stampJobOwner(job: MarketplaceJob, owner?: JobOwner): MarketplaceJob {
  if (!owner?.sessionId && !owner?.payerAddress && !owner?.gatewayPayerAddress) return job;
  const payer = owner.gatewayPayerAddress ?? owner.payerAddress ?? primaryOwnerPayerAddress();
  return {
    ...job,
    ownerSessionId: owner.sessionId ?? job.ownerSessionId,
    payerAddress: job.payerAddress ?? payer,
  };
}

export function attachJobPaymentMeta(job: MarketplaceJob, owner?: JobOwner): MarketplaceJob {
  const paidBy = extractJobPaidBy(job);
  const payer = paidBy ?? owner?.gatewayPayerAddress ?? owner?.payerAddress ?? primaryOwnerPayerAddress();
  return {
    ...job,
    ownerSessionId: job.ownerSessionId ?? owner?.sessionId,
    payerAddress: job.payerAddress ?? payer,
  };
}

export function stampJobFromAuction(job: MarketplaceJob, auction: Pick<ReverseAuction, "ownerSessionId" | "payerAddress">): MarketplaceJob {
  return stampJobOwner(job, {
    sessionId: auction.ownerSessionId,
    payerAddress: auction.payerAddress,
  });
}

export function stampAuctionOwner(auction: ReverseAuction, owner?: JobOwner): ReverseAuction {
  if (!owner?.sessionId && !owner?.payerAddress && !owner?.gatewayPayerAddress) return auction;
  const payer = owner.gatewayPayerAddress ?? owner.payerAddress ?? primaryOwnerPayerAddress();
  return {
    ...auction,
    ownerSessionId: owner.sessionId ?? auction.ownerSessionId,
    payerAddress: auction.payerAddress ?? payer,
  };
}

/** Only show jobs this browser session (or payer wallet) created. */
export function jobVisibleToOwner(job: MarketplaceJob, owner: JobOwner): boolean {
  if (owner.sessionId && job.ownerSessionId && job.ownerSessionId === owner.sessionId) {
    return true;
  }
  if (jobPayerMatchesOwner(job, owner)) return true;
  return false;
}

export function filterJobsForOwner(jobs: MarketplaceJob[], owner: JobOwner): MarketplaceJob[] {
  if (!ownerHasIdentity(owner)) return [];
  return jobs.filter((j) => jobVisibleToOwner(j, owner));
}

/** Claim orphan jobs paid by this wallet and stamp session for future refreshes. */
export function backfillJobsForOwner(
  jobs: MarketplaceJob[],
  owner: JobOwner
): { jobs: MarketplaceJob[]; updated: MarketplaceJob[] } {
  if (!ownerHasIdentity(owner)) return { jobs: [], updated: [] };

  const updated: MarketplaceJob[] = [];
  const visible = jobs
    .map((job) => {
      if (jobVisibleToOwner(job, owner)) return job;
      if (!jobPayerMatchesOwner(job, owner)) return null;
      const claimed = attachJobPaymentMeta(job, owner);
      if (owner.sessionId && !claimed.ownerSessionId) {
        claimed.ownerSessionId = owner.sessionId;
      }
      updated.push(claimed);
      return claimed;
    })
    .filter((j): j is MarketplaceJob => !!j);

  return { jobs: visible, updated };
}

export function auctionVisibleToOwner(auction: ReverseAuction, owner: JobOwner): boolean {
  if (owner.sessionId && auction.ownerSessionId && auction.ownerSessionId === owner.sessionId) {
    return true;
  }
  const addrs = resolveOwnerPayerAddresses(owner);
  if (auction.payerAddress && addrs.length > 0) {
    return addrs.includes(auction.payerAddress.toLowerCase());
  }
  return false;
}

export function filterAuctionsForOwner(auctions: ReverseAuction[], owner: JobOwner): ReverseAuction[] {
  if (!ownerHasIdentity(owner)) return [];
  return auctions.filter((a) => auctionVisibleToOwner(a, owner));
}
