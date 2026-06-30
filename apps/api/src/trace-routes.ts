import type { Express } from "express";

/** Arc 101 trace APIs (circle-agent compatible) — required for Activity → Trace flow. */
export async function registerTraceRoutes(app: Express): Promise<void> {
  const [{ fetchSettlement, resolveBatchTx }, { decodeBatch }] = await Promise.all([
    import("./circle-agent/trace.ts"),
    import("./circle-agent/decode-batch.ts"),
  ]);

  app.get("/api/settlement/:id", async (req, res) => {
    const { status, body } = await fetchSettlement(req.params.id);
    res.status(status).type("application/json").send(body);
  });

  app.get("/api/batch-tx/:id", async (req, res) => {
    try {
      const result = await resolveBatchTx(req.params.id);
      if ("error" in result && result.error) {
        res.status(result.status ?? 400).json({ error: result.error });
        return;
      }
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "batch-tx failed" });
    }
  });

  app.get("/api/decode-batch/:hash", async (req, res) => {
    try {
      const decoded = await decodeBatch(req.params.hash as `0x${string}`);
      res.json({
        ...decoded,
        blockNumber: decoded.blockNumber.toString(),
        entries: decoded.entries.map((e) => ({
          address: e.address,
          deltaRaw: e.delta.toString(),
          usdc: e.usdc,
        })),
      });
    } catch (e) {
      res.status(400).json({ error: e instanceof Error ? e.message : "decode failed" });
    }
  });
}
