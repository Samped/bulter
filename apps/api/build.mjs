#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Bump when ledger / activity backfill logic changes (see route-loader-status.ts). */
const LEDGER_BACKFILL_VERSION = 2;

mkdirSync("dist", { recursive: true });

function printBuildErrors(error) {
  if (error && typeof error === "object" && "errors" in error && Array.isArray(error.errors)) {
    for (const e of error.errors) {
      console.error(e.text || e.message || String(e));
      if (e.location) {
        console.error(`  at ${e.location.file}:${e.location.line}:${e.location.column}`);
      }
    }
    return;
  }
  console.error(error);
}

try {
  await esbuild.build({
    entryPoints: ["src/server.ts"],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: "dist/server.mjs",
    external: [
      "express",
      "cors",
      "dotenv",
      "@circle-fin/x402-batching",
      "@x402/core",
      "@x402/evm",
      "viem",
    ],
    logLevel: "warning",
  });
} catch (error) {
  console.error("esbuild failed:");
  printBuildErrors(error);
  process.exit(1);
}

let gitHead = "unknown";
try {
  gitHead = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}

writeFileSync(
  "dist/build-stamp.json",
  JSON.stringify({ builtAt: new Date().toISOString(), ledgerVersion: LEDGER_BACKFILL_VERSION, gitHead }, null, 2)
);

console.log(`API bundle → dist/server.mjs (ledger v${LEDGER_BACKFILL_VERSION})`);
