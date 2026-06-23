import { deploySmartAccountsEnvironment } from "@metamask/smart-accounts-kit/utils";
import { arcChain, arcPublicClient, arcWalletClient, requireKey } from "./clients.ts";
import { buildArcSmartAccountsEnvironment } from "./environment.ts";
import { DELEGATION_FRAMEWORK_V130 } from "./arc-env.ts";

export async function deployArcDelegationFramework() {
  const pk = requireKey("BUTLER_DEPLOYER_PRIVATE_KEY");
  const walletClient = arcWalletClient(pk);
  const publicClient = arcPublicClient();

  const env = await deploySmartAccountsEnvironment(walletClient, publicClient, arcChain);
  buildArcSmartAccountsEnvironment();
  return env;
}

export async function checkDelegationFramework() {
  const publicClient = arcPublicClient();
  const code = await publicClient.getBytecode({
    address: DELEGATION_FRAMEWORK_V130.DelegationManager,
  });
  return {
    deployed: !!code && code !== "0x",
    delegationManager: DELEGATION_FRAMEWORK_V130.DelegationManager,
    chainId: arcChain.id,
  };
}
