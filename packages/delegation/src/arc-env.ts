import type { Address, Hex } from "viem";

/** MetaMask Delegation Framework v1.3.0 — deterministic CREATE2 addresses (same on all deployed chains). */
export const DELEGATION_FRAMEWORK_V130 = {
  SimpleFactory: "0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c",
  DelegationManager: "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3",
  HybridDeleGatorImpl: "0x48dBe696A4D990079e039489bA2053B36E8FFEC4",
  MultiSigDeleGatorImpl: "0x56a9EdB16a0105eb5a4C54f4C062e2868844f3A7",
  EIP7702StatelessDeleGatorImpl: "0x63c0c19a282a1B52b07dD5a65b58948A07DAE32B",
  enforcers: {
    AllowedTargets: "0x7F20f61b1f09b08D970938F6fa563634d65c4EeB",
    ERC20TransferAmount: "0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc",
    ERC20PeriodTransfer: "0x474e3Ae7E169e940607cC624Da8A15Eb120139aB",
    Timestamp: "0x1046bb45C8d673d4ea75321280DB34899413c069",
    ValueLte: "0x92Bf12322527cAA612fd31a0e810472BBB106A8F",
  },
} as const;

/** Arc testnet USDC ERC-20 interface (6 decimals). */
export const ARC_USDC = "0x3600000000000000000000000000000000000000" as Address;

export const ARC_CHAIN_ID = 5042002;

/** Custom Butler enforcer — set after `forge script DeployButlerEnforcer`. */
export function getButlerSpendEnforcer(): Address {
  const fromEnv = process.env.BUTLER_SPEND_ENFORCER_ADDRESS;
  if (fromEnv && fromEnv.startsWith("0x")) return fromEnv as Address;
  return "0x0000000000000000000000000000000000000000";
}

/** Build SmartAccountsEnvironment for Arc (not in MetaMask kit chain list yet). */
export function getArcDelegationEnvironment() {
  const fw = DELEGATION_FRAMEWORK_V130;
  return {
    chainId: ARC_CHAIN_ID,
    delegationManager: fw.DelegationManager as Address,
    simpleFactory: fw.SimpleFactory as Address,
    implementations: {
      hybrid: fw.HybridDeleGatorImpl as Address,
      multiSig: fw.MultiSigDeleGatorImpl as Address,
      eip7702Stateless: fw.EIP7702StatelessDeleGatorImpl as Address,
    },
    caveatEnforcers: {
      allowedTargets: fw.enforcers.AllowedTargets as Address,
      erc20TransferAmount: fw.enforcers.ERC20TransferAmount as Address,
      erc20PeriodTransfer: fw.enforcers.ERC20PeriodTransfer as Address,
      timestamp: fw.enforcers.Timestamp as Address,
      valueLte: fw.enforcers.ValueLte as Address,
      butlerSpend: getButlerSpendEnforcer(),
    },
  };
}

export interface DelegationSetup {
  userHybridAddress: Address;
  executorAddress: Address;
  orchestratorAddress?: Address;
  permissionContext?: Hex;
  enforcerAddress: Address;
  deployedAt: number;
  chainId: number;
}

export function usdcToMicro(amount: string): bigint {
  const [whole, frac = ""] = amount.split(".");
  const padded = (frac + "000000").slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

export function encodeButlerSpendTerms(
  usdc: Address,
  rules: { recipient: Address; maxAmountUsdc: string }[]
): Hex {
  const parts: Hex[] = [usdc];
  for (const r of rules) {
    const max = usdcToMicro(r.maxAmountUsdc);
    const amountHex = max.toString(16).padStart(16, "0");
    parts.push(`${r.recipient}${amountHex}` as Hex);
  }
  // Manual pack: address + (address + uint96)*
  let packed = usdc.slice(2);
  for (const r of rules) {
    const max = usdcToMicro(r.maxAmountUsdc);
    packed += r.recipient.slice(2).toLowerCase();
    packed += max.toString(16).padStart(16, "0");
  }
  return `0x${packed}` as Hex;
}
