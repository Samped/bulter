#!/usr/bin/env node
/** Minimal workspaces for Render API — avoids OOM from installing the full monorepo. */
const fs = require("node:fs");

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.workspaces = [
  "packages/arc",
  "packages/core",
  "packages/delegation",
  "apps/api",
];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("workspaces → render API slice (arc, core, delegation, api)");
