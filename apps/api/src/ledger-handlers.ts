import type { Request, Response } from "express";
import { loadState, remainingDailyUsdc, type SpendRecord } from "@butler/core";
import {
  applyJobAttribution,
  attributeLedgerRecords,
  filterMineRecords,
  filterRecordsForOwner,
  resolveSessionActivityPayerAddresses,
} from "./ledger-payer.ts";
import { resolveMarketplaceForLedger, syncLedgerFromJobs } from "./ledger-sync.ts";
import { resolveJobOwnerFromRequest, resolveOwnerPayerAddresses } from "./job-owner.ts";

export function handleGetLedger(
  req: Request,
  res: Response,
  statePath: string,
  sellerAddress: `0x${string}`,
  marketplacePath?: string
): void {
  const state = loadState(statePath, sellerAddress);
  const { jobs, auctions } = resolveMarketplaceForLedger(statePath, marketplacePath, sellerAddress);
  const scope = String(req.query.scope ?? "all");
  const owner = resolveJobOwnerFromRequest(req);

  const ledgerRecords = syncLedgerFromJobs(statePath, sellerAddress, jobs, auctions);
  const attributed = applyJobAttribution(
    attributeLedgerRecords(ledgerRecords),
    jobs,
    auctions
  );

  const sessionPayers = resolveSessionActivityPayerAddresses(state.records);
  const ownerPayerAddresses = resolveOwnerPayerAddresses(owner);
  const activityPayerAddresses =
    sessionPayers.length > 0 ? sessionPayers : ownerPayerAddresses;

  const allRecords = attributed.slice().reverse();
  const hasOwner = !!(owner.sessionId || owner.payerAddress || owner.gatewayPayerAddress);

  let records: SpendRecord[];
  if (scope === "mine") {
    if (owner.sessionId) {
      records = filterRecordsForOwner(attributed, owner, jobs, auctions);
      if (records.length === 0 && sessionPayers.length > 0) {
        records = filterMineRecords(attributed, sessionPayers);
      }
    } else if (sessionPayers.length > 0) {
      records = filterMineRecords(attributed, sessionPayers);
    } else if (hasOwner) {
      records = filterRecordsForOwner(attributed, owner, jobs, auctions);
    } else {
      records = [];
    }
    records = records.slice().reverse();
  } else if (hasOwner && scope === "yours") {
    records = filterRecordsForOwner(attributed, owner, jobs, auctions).slice().reverse();
  } else {
    records = allRecords;
  }

  res.json({
    remainingDailyUsdc: remainingDailyUsdc(state.policy, ledgerRecords),
    records,
    totalCount: allRecords.length,
    activityPayerAddresses,
  });
}
