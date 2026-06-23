#!/usr/bin/env node
/**
 * ERC-7710 setup: create user Hybrid SC + sign root delegation to Butler executor.
 * Saves delegation chain to .data/delegation.json
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { loadState, saveState } from "@butler/core";
import {
  buildArcSmartAccountsEnvironment,
  buildRootDelegation,
  checkDelegationFramework,
  createUserHybridAccount,
  enableDelegationOnHybrid,
  signRootDelegation,
  requireKey,
  getButlerSpendEnforcer,
} from "@butler/delegation";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../../..");
config({ path: resolve(ROOT, ".env") });

const STATE_PATH = resolve(ROOT, ".data/butler-state.json");
const DELEGATION_PATH = resolve(ROOT, ".data/delegation.json");

async function main() {
  const fw = await checkDelegationFramework();
  if (!fw.deployed) {
    console.error("Delegation framework not on Arc. Run: npm run delegation:deploy");
    process.exit(1);
  }

  const ownerKey = requireKey("BUTLER_OWNER_PRIVATE_KEY");
  const executorKey = requireKey("BUTLER_EXECUTOR_PRIVATE_KEY");
  const env = buildArcSmartAccountsEnvironment();
  const butlerEnforcer = getButlerSpendEnforcer();

  if (butlerEnforcer === "0x0000000000000000000000000000000000000000") {
    console.warn("WARN: BUTLER_SPEND_ENFORCER_ADDRESS not set — using Timestamp + ERC20Period only");
  }

  console.log("==> Creating user Hybrid smart account");
  const { account } = await createUserHybridAccount({ ownerPrivateKey: ownerKey, environment: env });
  console.log("  Hybrid SC:", account.address);

  const state = loadState(STATE_PATH);
  state.policy.ownerAddress = account.address;
  saveState(state, STATE_PATH);

  const { privateKeyToAccount } = await import("viem/accounts");
  const executor = privateKeyToAccount(executorKey);

  const unsigned = buildRootDelegation({
    from: account.address,
    to: executor.address,
    policy: state.policy,
    environment: env,
    butlerEnforcer,
  });

  console.log("==> Signing root delegation (ERC-7710)");
  const signed = signRootDelegation({ delegation: unsigned, ownerPrivateKey: ownerKey });

  console.log("==> Enabling delegation on Hybrid SC");
  const enableTx = await enableDelegationOnHybrid({
    hybridAccount: account,
    signedDelegation: signed,
    ownerPrivateKey: ownerKey,
  });
  console.log("  enable tx:", enableTx);

  const record = {
    userHybridAddress: account.address,
    executorAddress: executor.address,
    enforcerAddress: butlerEnforcer,
    permissionContext: signed,
    delegations: [[signed]],
    chainId: 5042002,
    deployedAt: Math.floor(Date.now() / 1000),
    enableTx,
  };

  mkdirSync(dirname(DELEGATION_PATH), { recursive: true });
  writeFileSync(DELEGATION_PATH, JSON.stringify(record, null, 2));
  console.log("==> Saved", DELEGATION_PATH);
  console.log("\nButler can now pay via: npm run delegation:pay");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
