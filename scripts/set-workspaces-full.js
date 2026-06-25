#!/usr/bin/env node
/** Restore full monorepo workspaces for local API/agent/delegation work. */
const fs = require("node:fs");

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.workspaces = ["packages/*", "apps/*"];
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log("workspaces → packages/*, apps/*");
