/**
 * Arc 101 payment trace helpers — from the-canteen-dev/circle-agent
 */
import { ARC_EXPLORER, GATEWAY_FACILITATOR, GATEWAY_WALLET_ARC, PINNED_BATCH_TX } from "@butler/arc";
import { loadMarketplaceState, loadState } from "@butler/core";
import type { Request } from "express";
import { resolveButlerStatePath, resolveMarketplaceStatePath } from "../data-paths.ts";
import {
  jobVisibleToOwner,
  normalizeOwnerEmail,
  resolveJobOwnerFromRequest,
  resolveOwnerPayerAddresses,
  type JobOwner,
} from "../job-owner.ts";

const GATEWAY_API =
  process.env.GATEWAY_API ??
  process.env.GATEWAY_FACILITATOR_URL ??
  GATEWAY_FACILITATOR;

function isInternalSettlementId(id: string): boolean {
  return id.startsWith("internal-");
}

function findInternalSpendRecord(id: string) {
  const state = loadState(resolveButlerStatePath());
  return state.records.find((r) => r.settlementId === id) ?? null;
}

function ownerCanAccessSpend(
  record: NonNullable<ReturnType<typeof findInternalSpendRecord>>,
  owner: JobOwner
): boolean {
  const ownerEmail = normalizeOwnerEmail(owner.email);
  const rowEmail = normalizeOwnerEmail(record.payerEmail);
  if (ownerEmail && rowEmail) return ownerEmail === rowEmail;
  if (ownerEmail && rowEmail && ownerEmail !== rowEmail) return false;
  const addrs = resolveOwnerPayerAddresses(owner);
  const payer = record.payerAddress?.toLowerCase();
  const executor = record.executorAddress?.toLowerCase();
  if (addrs.length > 0) {
    if (payer && addrs.includes(payer)) return !rowEmail || rowEmail === ownerEmail;
    if (executor && addrs.includes(executor)) return !rowEmail || rowEmail === ownerEmail;
  }
  return false;
}

function ownerOwnsSettlement(settlementId: string, owner: JobOwner): boolean {
  const internal = findInternalSpendRecord(settlementId);
  if (internal) return ownerCanAccessSpend(internal, owner);

  const mp = loadMarketplaceState(resolveMarketplaceStatePath());
  for (const job of mp.jobs) {
    if (!jobVisibleToOwner(job, owner)) continue;
    if (job.steps.some((s) => s.settlementId === settlementId)) return true;
  }
  return false;
}

/** Local in-process pays use `internal-<uuid>` — not Circle Gateway transfer IDs. */
function internalSettlementPayload(id: string) {
  const record = findInternalSpendRecord(id);
  if (!record) {
    return {
      status: 404,
      body: JSON.stringify({
        success: false,
        mode: "internal",
        message: "Internal settlement not found in Butler ledger",
        id,
      }),
    };
  }
  return {
    status: 200,
    body: JSON.stringify({
      id,
      status: record.status === "settled" ? "completed" : record.status,
      mode: "internal",
      amount: record.amountUsdc,
      currency: "USDC",
      merchantId: record.merchantId,
      agent: record.agent,
      category: record.category,
      payerAddress: record.payerAddress,
      executorAddress: record.executorAddress,
      payerEmail: record.payerEmail,
      initiator: record.initiator,
      updatedAt: new Date(record.at * 1000).toISOString(),
      createdAt: new Date(record.at * 1000).toISOString(),
      message: "In-process marketplace payment (not a Circle Gateway transfer)",
      recordId: record.id,
    }),
  };
}

export async function fetchSettlement(id: string, owner?: JobOwner) {
  const trimmed = id.trim();
  if (owner && !ownerOwnsSettlement(trimmed, owner)) {
    return {
      status: 404,
      body: JSON.stringify({ success: false, message: "Settlement not found" }),
    };
  }
  if (isInternalSettlementId(trimmed)) {
    return internalSettlementPayload(trimmed);
  }
  const r = await fetch(`${GATEWAY_API}/v1/x402/transfers/${trimmed}`);
  const text = await r.text();
  return { status: r.status, body: text };
}

export async function resolveBatchTx(settlementId: string, owner?: JobOwner) {
  const trimmed = settlementId.trim();
  if (owner && !ownerOwnsSettlement(trimmed, owner)) {
    return { error: "Settlement not found", status: 404 };
  }
  if (isInternalSettlementId(trimmed)) {
    const record = findInternalSpendRecord(trimmed);
    if (!record) {
      return { error: "Internal settlement not found", status: 404 };
    }
    return {
      batchTx: null,
      status: "internal",
      mode: "internal",
      explorerUrl: null,
      amount: record.amountUsdc,
      merchantId: record.merchantId,
      message: "Internal pays settle off Gateway — no Arc batch tx",
    };
  }
  const sr = await fetch(`${GATEWAY_API}/v1/x402/transfers/${trimmed}`);
  if (!sr.ok) {
    return { error: await sr.text(), status: sr.status };
  }
  const settlement = (await sr.json()) as { status: string; updatedAt: string };
  if (settlement.status !== "completed" && settlement.status !== "confirmed") {
    return { batchTx: null, status: settlement.status };
  }
  const pinned = PINNED_BATCH_TX[trimmed];
  if (pinned) {
    return {
      batchTx: pinned,
      status: settlement.status,
      explorerUrl: `${ARC_EXPLORER}/tx/${pinned}`,
    };
  }
  const tr = await fetch(
    `${ARC_EXPLORER}/api/v2/addresses/${GATEWAY_WALLET_ARC}/transactions?filter=to`,
  );
  const { items } = (await tr.json()) as {
    items: { hash: string; timestamp: string; method: string | null }[];
  };
  const updatedAt = new Date(settlement.updatedAt).getTime();
  const candidate = items.find(
    (t) =>
      t.method === "submitBatch" &&
      new Date(t.timestamp).getTime() <= updatedAt + 5_000,
  );
  return {
    batchTx: candidate?.hash ?? null,
    status: settlement.status,
    explorerUrl: candidate ? `${ARC_EXPLORER}/tx/${candidate.hash}` : null,
  };
}

export function ownerFromTraceRequest(req: Request): JobOwner {
  return resolveJobOwnerFromRequest(req);
}
