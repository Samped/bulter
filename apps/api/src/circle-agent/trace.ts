/**
 * Arc 101 payment trace helpers — from the-canteen-dev/circle-agent
 */
import { ARC_EXPLORER, GATEWAY_FACILITATOR, GATEWAY_WALLET_ARC, PINNED_BATCH_TX } from "@butler/arc";

const GATEWAY_API =
  process.env.GATEWAY_API ??
  process.env.GATEWAY_FACILITATOR_URL ??
  GATEWAY_FACILITATOR;

export async function fetchSettlement(id: string) {
  const r = await fetch(`${GATEWAY_API}/v1/x402/transfers/${id}`);
  const text = await r.text();
  return { status: r.status, body: text };
}

export async function resolveBatchTx(settlementId: string) {
  const sr = await fetch(`${GATEWAY_API}/v1/x402/transfers/${settlementId}`);
  if (!sr.ok) {
    return { error: await sr.text(), status: sr.status };
  }
  const settlement = (await sr.json()) as { status: string; updatedAt: string };
  if (settlement.status !== "completed" && settlement.status !== "confirmed") {
    return { batchTx: null, status: settlement.status };
  }
  const pinned = PINNED_BATCH_TX[settlementId];
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
