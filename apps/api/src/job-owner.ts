import type { MarketplaceJob, ReverseAuction } from "@butler/core";
import type { Request } from "express";
import { loadCircleConfig, resolveCircleExecutorAddress } from "./circle-config.ts";
import { sessionIdFromRequest } from "./user-session.ts";

export type JobOwner = {
  sessionId?: string;
  payerAddress?: string;
  gatewayPayerAddress?: string;
  /** Normalized Circle login email for this browser session. */
  email?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function normalizeOwnerEmail(email?: string | null): string | undefined {
  const v = email?.trim().toLowerCase();
  return v && v.includes("@") ? v : undefined;
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
    email: normalizeOwnerEmail(cfg.email),
  };
}

export function resolveJobOwnerFromRequest(req: Request): JobOwner {
  const sessionId = sessionIdFromRequest(req) ?? undefined;
  const fromHeader = normalizeOwnerEmail(String(req.headers["x-butler-payer-email"] ?? ""));
  const owner = resolveJobOwnerFromSession(sessionId);
  if (fromHeader && !owner.email) {
    return { ...owner, email: fromHeader };
  }
  // Prefer session config email; header can confirm the same account.
  if (fromHeader && owner.email && fromHeader !== owner.email) {
    // Different email in header vs session — trust session Circle login.
    return owner;
  }
  return owner;
}

/** Wallet + Gateway payer addresses for the connected session. */
export function resolveOwnerPayerAddresses(owner: JobOwner): string[] {
  const set = new Set<string>();
  if (owner.payerAddress) set.add(owner.payerAddress.toLowerCase());
  if (owner.gatewayPayerAddress) set.add(owner.gatewayPayerAddress.toLowerCase());
  return [...set];
}

function ownerHasIdentity(owner: JobOwner): boolean {
  return !!normalizeOwnerEmail(owner.email) || !!owner.sessionId || resolveOwnerPayerAddresses(owner).length > 0;
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

function jobEmailMatchesOwner(job: MarketplaceJob, owner: JobOwner): boolean {
  const ownerEmail = normalizeOwnerEmail(owner.email);
  const jobEmail = normalizeOwnerEmail(job.ownerEmail);
  if (!ownerEmail || !jobEmail) return false;
  return ownerEmail === jobEmail;
}

export function stampJobOwner(job: MarketplaceJob, owner?: JobOwner): MarketplaceJob {
  if (!owner?.sessionId && !owner?.payerAddress && !owner?.gatewayPayerAddress && !owner?.email) {
    return job;
  }
  const payer = owner.payerAddress ?? owner.gatewayPayerAddress ?? primaryOwnerPayerAddress();
  const email = normalizeOwnerEmail(owner.email) ?? normalizeOwnerEmail(job.ownerEmail);
  return {
    ...job,
    ownerSessionId: owner.sessionId ?? job.ownerSessionId,
    payerAddress: job.payerAddress ?? payer,
    ownerEmail: email ?? job.ownerEmail,
  };
}

export function attachJobPaymentMeta(job: MarketplaceJob, owner?: JobOwner): MarketplaceJob {
  const paidBy = extractJobPaidBy(job);
  // Prefer executor over shared Gateway payer so ownership stays per Circle account.
  const payer = paidBy ?? owner?.payerAddress ?? owner?.gatewayPayerAddress ?? primaryOwnerPayerAddress();
  const email = normalizeOwnerEmail(owner?.email) ?? normalizeOwnerEmail(job.ownerEmail);
  return {
    ...job,
    ownerSessionId: job.ownerSessionId ?? owner?.sessionId,
    payerAddress: job.payerAddress ?? payer,
    ownerEmail: email ?? job.ownerEmail,
  };
}

export function stampJobFromAuction(
  job: MarketplaceJob,
  auction: Pick<ReverseAuction, "ownerSessionId" | "payerAddress" | "ownerEmail">
): MarketplaceJob {
  return stampJobOwner(job, {
    sessionId: auction.ownerSessionId,
    payerAddress: auction.payerAddress,
    email: auction.ownerEmail,
  });
}

export function stampAuctionOwner(auction: ReverseAuction, owner?: JobOwner): ReverseAuction {
  if (!owner?.sessionId && !owner?.payerAddress && !owner?.gatewayPayerAddress && !owner?.email) {
    return auction;
  }
  const payer = owner.payerAddress ?? owner.gatewayPayerAddress ?? primaryOwnerPayerAddress();
  return {
    ...auction,
    ownerSessionId: owner.sessionId ?? auction.ownerSessionId,
    payerAddress: auction.payerAddress ?? payer,
    ownerEmail: normalizeOwnerEmail(owner.email) ?? auction.ownerEmail,
  };
}

/**
 * Only show jobs owned by this Circle email (preferred), else legacy session/wallet match.
 * Logged-out callers with no email see nothing.
 */
export function jobVisibleToOwner(job: MarketplaceJob, owner: JobOwner): boolean {
  const ownerEmail = normalizeOwnerEmail(owner.email);
  const jobEmail = normalizeOwnerEmail(job.ownerEmail);

  if (ownerEmail) {
    if (jobEmail) return jobEmail === ownerEmail;
    // Legacy rows without email: session match only. Wallet-only claim is limited to
    // unowned orphans — shared Gateway payers must not leak another session's library.
    if (owner.sessionId && job.ownerSessionId && job.ownerSessionId === owner.sessionId) return true;
    if (!job.ownerSessionId && jobPayerMatchesOwner(job, owner)) return true;
    return false;
  }

  // No email on the session — do not expose Library across accounts via wallet alone.
  if (owner.sessionId && job.ownerSessionId && job.ownerSessionId === owner.sessionId) {
    return true;
  }
  return false;
}

export function filterJobsForOwner(jobs: MarketplaceJob[], owner: JobOwner): MarketplaceJob[] {
  if (!ownerHasIdentity(owner)) return [];
  return jobs.filter((j) => jobVisibleToOwner(j, owner));
}

/** Claim legacy jobs for this email/session and stamp ownerEmail for future isolation. */
export function backfillJobsForOwner(
  jobs: MarketplaceJob[],
  owner: JobOwner
): { jobs: MarketplaceJob[]; updated: MarketplaceJob[] } {
  if (!ownerHasIdentity(owner)) return { jobs: [], updated: [] };

  const ownerEmail = normalizeOwnerEmail(owner.email);
  const updated: MarketplaceJob[] = [];
  const visible = jobs
    .map((job) => {
      if (!jobVisibleToOwner(job, owner)) return null;
      let next = job;
      if (ownerEmail && normalizeOwnerEmail(job.ownerEmail) !== ownerEmail) {
        next = { ...next, ownerEmail };
        updated.push(next);
      } else if (owner.sessionId && !job.ownerSessionId) {
        next = attachJobPaymentMeta(job, owner);
        updated.push(next);
      }
      return next;
    })
    .filter((j): j is MarketplaceJob => !!j);

  return { jobs: visible, updated };
}

export function auctionVisibleToOwner(auction: ReverseAuction, owner: JobOwner): boolean {
  const ownerEmail = normalizeOwnerEmail(owner.email);
  const auctionEmail = normalizeOwnerEmail(auction.ownerEmail);
  if (ownerEmail) {
    if (auctionEmail) return auctionEmail === ownerEmail;
    if (owner.sessionId && auction.ownerSessionId && auction.ownerSessionId === owner.sessionId) {
      return true;
    }
    const addrs = resolveOwnerPayerAddresses(owner);
    if (!auction.ownerSessionId && auction.payerAddress && addrs.length > 0) {
      return addrs.includes(auction.payerAddress.toLowerCase());
    }
    return false;
  }
  if (owner.sessionId && auction.ownerSessionId && auction.ownerSessionId === owner.sessionId) {
    return true;
  }
  return false;
}

export function filterAuctionsForOwner(auctions: ReverseAuction[], owner: JobOwner): ReverseAuction[] {
  if (!ownerHasIdentity(owner)) return [];
  return auctions.filter((a) => auctionVisibleToOwner(a, owner));
}
