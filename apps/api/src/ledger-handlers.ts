import type { Request, Response } from "express";
import { loadMarketplaceState, loadState, remainingDailyUsdc, type SpendRecord } from "@butler/core";
import {
  applyJobAttribution,
  attributeLedgerRecords,
  filterMineRecords,
  filterRecordsForOwner,
  resolveActivityPayerAddresses,
  resolveSessionActivityPayerAddresses,
} from "./ledger-payer.ts";
import { resolveJobOwnerFromRequest, resolveOwnerPayerAddresses } from "./job-owner.ts";

export function handleGetLedger(
  req: Request,
  res: Response,
  statePath: string,
  sellerAddress: `0x${string}`,
  marketplacePath?: string
): void {
  const state = loadState(statePath, sellerAddress);
  const mp = loadMarketplaceState(marketplacePath ?? statePath, sellerAddress);
  const scope = String(req.query.scope ?? "all");
  const owner = resolveJobOwnerFromRequest(req);

  const attributed = applyJobAttribution(
    attributeLedgerRecords(state.records),
    mp.jobs,
    mp.auctions
  );

  const sessionPayers = resolveSessionActivityPayerAddresses(state.records);
  const activityPayerAddresses =
    sessionPayers.length > 0 ? sessionPayers : resolveActivityPayerAddresses(state.records);

  const allRecords = attributed.slice().reverse();
  const hasOwner = !!(owner.sessionId || owner.payerAddress || owner.gatewayPayerAddress);

  let records: SpendRecord[];
  if (scope === "mine") {
    const mineAddrs =
      activityPayerAddresses.length > 0 ? activityPayerAddresses : resolveOwnerPayerAddresses(owner);
    records = filterMineRecords(attributed, mineAddrs);
    if (records.length === 0 && hasOwner) {
      records = filterRecordsForOwner(attributed, owner, mp.jobs, mp.auctions);
    }
    records = records.slice().reverse();
  } else if (hasOwner && scope === "yours") {
    records = filterRecordsForOwner(attributed, owner, mp.jobs, mp.auctions).slice().reverse();
  } else {
    records = allRecords;
  }

  res.json({
    remainingDailyUsdc: remainingDailyUsdc(state.policy, state.records),
    records,
    totalCount: allRecords.length,
    activityPayerAddresses,
  });
}
