import { createPublicClient, createWalletClient, http, type Address, type Chain, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet, resolveArcRpc } from "@butler/arc";

export const arcChain = arcTestnet as Chain;

export function arcPublicClient() {
  const rpc = resolveArcRpc();
  return createPublicClient({ chain: arcChain, transport: http(rpc) });
}

export function arcWalletClient(privateKey: Hex) {
  const rpc = resolveArcRpc();
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({ account, chain: arcChain, transport: http(rpc) });
}

export function requireKey(name: string): Hex {
  const v = process.env[name];
  if (!v || !v.startsWith("0x") || v.length < 66) {
    throw new Error(`Set ${name} in .env`);
  }
  return v as Hex;
}

export function sellerAddress(): Address {
  return (process.env.BUTLER_SELLER_ADDRESS ?? "0x933a2405f84c224be1ef373ba16e992e1f459682") as Address;
}
