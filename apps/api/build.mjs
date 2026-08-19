#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const apiRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(apiRoot, "../..");

/** Bump when ledger / activity backfill logic changes (see route-loader-status.ts). */
const LEDGER_BACKFILL_VERSION = 2;

const distDir = resolve(apiRoot, "dist");
const circleBundleDir = resolve(distDir, "circle-bundle");

mkdirSync(distDir, { recursive: true });

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

function pkgDir(nodeModules, name) {
  if (name.startsWith("@")) {
    const [scope, pkg] = name.split("/");
    return resolve(nodeModules, scope, pkg);
  }
  return resolve(nodeModules, name);
}

function findWorkspaceCli() {
  for (const nodeModules of [
    resolve(apiRoot, "node_modules"),
    resolve(repoRoot, "node_modules"),
  ]) {
    const js = resolve(nodeModules, "@circle-fin/cli/dist/index.js");
    if (existsSync(js)) return { js, nodeModules };
  }
  return null;
}

/** Copy @circle-fin/cli and its dependency tree from an existing npm install (Render build). */
function copyCliTree(srcNm, destNm, pkgName, copied = new Set()) {
  if (copied.has(pkgName)) return;
  copied.add(pkgName);
  const src = pkgDir(srcNm, pkgName);
  if (!existsSync(src)) return;
  const dest = pkgDir(destNm, pkgName);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  let pkgJson;
  try {
    pkgJson = JSON.parse(readFileSync(resolve(src, "package.json"), "utf8"));
  } catch {
    return;
  }
  const deps = { ...(pkgJson.dependencies ?? {}), ...(pkgJson.optionalDependencies ?? {}) };
  for (const dep of Object.keys(deps)) {
    copyCliTree(srcNm, destNm, dep, copied);
  }
}

function bundleCircleCli() {
  rmSync(circleBundleDir, { recursive: true, force: true });
  mkdirSync(resolve(circleBundleDir, "node_modules"), { recursive: true });

  const workspace = findWorkspaceCli();
  if (workspace) {
    console.log("==> Copying Circle CLI from workspace node_modules into dist/circle-bundle");
    copyCliTree(workspace.nodeModules, resolve(circleBundleDir, "node_modules"), "@circle-fin/cli");
    return;
  }

  console.log("==> Installing Circle CLI into dist/circle-bundle (workspace copy unavailable)");
  writeFileSync(
    resolve(circleBundleDir, "package.json"),
    JSON.stringify(
      {
        name: "butler-circle-bundle",
        private: true,
        dependencies: { "@circle-fin/cli": "0.0.5" },
      },
      null,
      2
    )
  );
  execSync("npm install --omit=dev --no-audit --no-fund", {
    cwd: circleBundleDir,
    stdio: "inherit",
    timeout: 600_000,
  });
}

console.log("==> Bundling Circle CLI into dist/circle-bundle (Render runtime)");
bundleCircleCli();

const circleCliJs = resolve(circleBundleDir, "node_modules/@circle-fin/cli/dist/index.js");
const circleCliNm = resolve(circleBundleDir, "node_modules");
if (!existsSync(circleCliJs)) {
  console.error("FAIL: dist/circle-bundle missing @circle-fin/cli after npm install");
  process.exit(1);
}
execSync(`node "${circleCliJs}" --version`, {
  env: { ...process.env, NODE_PATH: circleCliNm, CIRCLE_ACCEPT_TERMS: "1" },
  stdio: "inherit",
});

let gitHead = "unknown";
try {
  gitHead = execSync("git rev-parse --short HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
} catch {
  /* not a git checkout */
}

writeFileSync(
  resolve(distDir, "build-stamp.json"),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      ledgerVersion: LEDGER_BACKFILL_VERSION,
      gitHead,
      circleCliRelJs: "circle-bundle/node_modules/@circle-fin/cli/dist/index.js",
      circleCliRelNm: "circle-bundle/node_modules",
    },
    null,
    2
  )
);

console.log(`API bundle → dist/server.mjs (ledger v${LEDGER_BACKFILL_VERSION}, Circle CLI bundled)`);
