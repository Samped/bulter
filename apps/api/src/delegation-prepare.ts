import {
  Implementation,
  toMetaMaskSmartAccount,
  type Delegation,
} from "@metamask/smart-accounts-kit";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { toDelegationStruct, SIGNABLE_DELEGATION_TYPED_DATA } from "@metamask/smart-accounts-kit/utils";
import type { Address, Hex } from "viem";
import { loadState } from "@butler/core";
import {
  arcPublicClient,
  buildArcSmartAccountsEnvironment,
  buildRootDelegation,
  getButlerSpendEnforcer,
  DELEGATION_FRAMEWORK_V130,
  ARC_CHAIN_ID,
} from "@butler/delegation";

const DEPLOY_SALT = ("0x" + "42".repeat(32)) as Hex;

export async function prepareDelegationSetup(params: {
  ownerAddress: Address;
  executorAddress: Address;
  sellerAddress: Address;
  statePath: string;
}) {
  const env = buildArcSmartAccountsEnvironment(getButlerSpendEnforcer());
  const state = loadState(params.statePath);
  const publicClient = arcPublicClient();

  const account = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [params.ownerAddress, [], [], []],
    environment: env,
    deploySalt: DEPLOY_SALT,
  });

  const hybridAddress = await account.getAddress();
  const factoryArgs = await account.getFactoryArgs();

  const unsigned = buildRootDelegation({
    from: hybridAddress,
    to: params.executorAddress,
    policy: state.policy,
    environment: env,
    butlerEnforcer: getButlerSpendEnforcer(),
    payoutAddress: params.sellerAddress,
  });

  const delegationStruct = toDelegationStruct({ ...unsigned, signature: "0x" });
  const signTypedData = {
    domain: {
      chainId: ARC_CHAIN_ID,
      name: "DelegationManager",
      version: "1",
      verifyingContract: DELEGATION_FRAMEWORK_V130.DelegationManager,
    },
    types: SIGNABLE_DELEGATION_TYPED_DATA,
    primaryType: "Delegation" as const,
    message: delegationStruct,
  };

  return {
    hybridAddress,
    unsignedDelegation: unsigned,
    factoryTx: {
      to: factoryArgs.factory,
      data: factoryArgs.factoryData,
    },
    signTypedData,
    delegationManager: DELEGATION_FRAMEWORK_V130.DelegationManager,
  };
}

export function finishDelegationSetup(params: {
  unsignedDelegation: Omit<Delegation, "signature">;
  signature: Hex;
}) {
  const signed: Delegation = { ...params.unsignedDelegation, signature: params.signature };
  const enableCalldata = DelegationManager.encode.enableDelegation({ delegation: signed });
  return { signedDelegation: signed, enableCalldata };
}
