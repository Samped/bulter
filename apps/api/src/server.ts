import { config } from "dotenv";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "cors";
import express from "express";
import { ARC_EIP155, resolveArcRpc } from "@butler/arc";
import { registerCircleLoginRoutes } from "./circle-login-routes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
const WEB_URL = process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? 5174}`;
const SELLER = (process.env.BUTLER_SELLER_ADDRESS ?? "0x933a2405f84c224be1ef373ba16e992e1f459682") as `0x${string}`;

mkdirSync(resolve(__dirname, "../../../.data/circle-home"), { recursive: true });

const app = express();
app.use(cors());
app.use(express.json());

let ready = false;
let resolveRoutesReady!: () => void;
const routesReady = new Promise<void>((resolve) => {
  resolveRoutesReady = resolve;
});

/** Login routes register first — never blocked by heavy route imports. */
registerCircleLoginRoutes(app);

app.use((req, res, next) => {
  if (req.path === "/api/health") return next();
  void routesReady.then(() => next());
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: ready,
    mode: ready ? "live" : "starting",
    chain: ARC_EIP155,
    seller: SELLER,
    ...(ready ? { rpc: resolveArcRpc().replace(/\/\/[^@]+@/, "//***@") } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`Butler API http://localhost:${PORT} (booting…)`);
  ready = true;
  resolveRoutesReady();
  console.log(`Butler API login ready · Circle OTP`);

  void import("./load-core-routes.ts")
    .then(({ loadCoreRoutes }) => {
      loadCoreRoutes(app);
      console.log(`Butler API core ready · Circle status + config`);
    })
    .catch((error) => {
      console.error("Butler API failed to load core routes:", error);
    });

  setImmediate(() => {
    if (process.env.BUTLER_LITE_API === "true") {
      console.log("Butler API lite mode — x402/marketplace routes skipped (set BUTLER_LITE_API=false for full API)");
      return;
    }
    void import("./load-routes.ts")
      .then(({ loadRoutes }) => loadRoutes(app))
      .then(() => {
        console.log(`Butler API ready · dashboard: ${WEB_URL}`);
      })
      .catch((error) => {
        console.error("Butler API failed to load heavy routes (login still works):", error);
      });
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("unhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("uncaughtException:", error);
});
