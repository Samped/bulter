import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  Implementation,
  toMetaMaskSmartAccount,
  signDelegation,
  type Delegation,
  type MetaMaskSmartAccount,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { encodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { ARC_CHAIN_ID, DELEGATION_FRAMEWORK_V130 } from "./arc-env.ts";
import { arcPublicClient, arcWalletClient } from "./clients.ts";

export async function createUserHybridAccount(params: {
  ownerPrivateKey: Hex;
  environment: SmartAccountsEnvironment;
  salt?: Hex;
}) {
  const owner = privateKeyToAccount(params.ownerPrivateKey);
  const publicClient = arcPublicClient();
  const walletClient = arcWalletClient(params.ownerPrivateKey);
  const account = await toMetaMaskSmartAccount({
    client: publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [owner.address, [], [], []],
    signer: { walletClient },
    environment: params.environment,
    deploySalt: params.salt ?? ("0x" + "42".repeat(32)) as Hex,
  });
  return { account, publicClient, walletClient, ownerAddress: owner.address };
}

export async function createUserHybridAccountWithWallet(params: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  environment: SmartAccountsEnvironment;
  salt?: Hex;
}) {
  const ownerAddress = params.walletClient.account?.address;
  if (!ownerAddress) throw new Error("Wallet not connected");

  const account = await toMetaMaskSmartAccount({
    client: params.publicClient,
    implementation: Implementation.Hybrid,
    deployParams: [ownerAddress, [], [], []],
    signer: { walletClient: params.walletClient },
    environment: params.environment,
    deploySalt: params.salt ?? ("0x" + "42".repeat(32)) as Hex,
  });
  return { account, ownerAddress };
}

export async function ensureHybridDeployed(params: {
  account: MetaMaskSmartAccount;
  walletClient: WalletClient;
  publicClient: PublicClient;
}) {
  const address = await params.account.getAddress();
  const code = await params.publicClient.getBytecode({ address });
  if (code && code !== "0x") return { address, deployTx: undefined as `0x${string}` | undefined };

  const factoryArgs = await params.account.getFactoryArgs();
  const hash = await params.walletClient.sendTransaction({
    chain: params.walletClient.chain,
    account: params.walletClient.account!,
    to: factoryArgs.factory,
    data: factoryArgs.factoryData,
  });
  await params.publicClient.waitForTransactionReceipt({ hash });
  return { address, deployTx: hash };
}

export function signRootDelegation(params: {
  delegation: Omit<Delegation, "signature">;
  ownerPrivateKey: Hex;
}): Delegation {
  const signature = signDelegation({
    privateKey: params.ownerPrivateKey,
    delegation: params.delegation,
    chainId: ARC_CHAIN_ID,
    delegationManager: DELEGATION_FRAMEWORK_V130.DelegationManager,
  });
  return { ...params.delegation, signature };
}

export async function signRootDelegationWithAccount(params: {
  account: MetaMaskSmartAccount;
  delegation: Omit<Delegation, "signature">;
}): Promise<Delegation> {
  const signature = await params.account.signDelegation({ delegation: params.delegation });
  return { ...params.delegation, signature };
}

export async function enableDelegationOnHybrid(params: {
  hybridAccount: MetaMaskSmartAccount;
  signedDelegation: Delegation;
  ownerPrivateKey: Hex;
}) {
  const walletClient = arcWalletClient(params.ownerPrivateKey);
  const publicClient = arcPublicClient();
  const data = DelegationManager.encode.enableDelegation({ delegation: params.signedDelegation });
  const address = await params.hybridAccount.getAddress();

  const hash = await walletClient.sendTransaction({
    to: address as Address,
    data,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function enableDelegationOnHybridWithWallet(params: {
  hybridAccount: MetaMaskSmartAccount;
  signedDelegation: Delegation;
  walletClient: WalletClient;
  publicClient: PublicClient;
}) {
  const data = DelegationManager.encode.enableDelegation({ delegation: params.signedDelegation });
  const address = await params.hybridAccount.getAddress();

  const hash = await params.walletClient.sendTransaction({
    chain: params.walletClient.chain,
    account: params.walletClient.account!,
    to: address as Address,
    data,
  });
  await params.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export function encodePermissionContext(delegations: Delegation[]): Hex {
  return encodeDelegations(delegations);
}
