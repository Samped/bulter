#!/usr/bin/env node
/** Deploy MetaMask Delegation Framework + ButlerSpendEnforcer on Arc testnet. */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deployArcDelegationFramework, checkDelegationFramework } from "@butler/delegation";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const before = await checkDelegationFramework();
  if (before.deployed) {
    console.log("Delegation framework already deployed on Arc");
    console.log("  DelegationManager:", before.delegationManager);
    return;
  }

  console.log("==> Deploying MetaMask Delegation Framework to Arc...");
  const env = await deployArcDelegationFramework();
  console.log("  DelegationManager:", env.DelegationManager);
  console.log("  HybridDeleGatorImpl:", env.implementations.HybridDeleGatorImpl);
  console.log("\nNext: forge script DeployButlerEnforcer.s.sol on Arc, set BUTLER_SPEND_ENFORCER_ADDRESS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
