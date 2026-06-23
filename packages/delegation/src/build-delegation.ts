import type { ButlerPolicy } from "@butler/core";
import {
  ScopeType,
  createDelegation,
  createCaveat,
  type Delegation,
  type SmartAccountsEnvironment,
} from "@metamask/smart-accounts-kit";
import { createCaveatBuilder } from "@metamask/smart-accounts-kit/utils";
import { encodeFunctionData, type Address, type Hex } from "viem";
import { ARC_USDC, encodeButlerSpendTerms, usdcToMicro } from "./arc-env.ts";
import { sellerAddress } from "./clients.ts";

const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export function buildMerchantRules(policy: ButlerPolicy, payoutAddress: Address) {
  return policy.merchants
    .filter((m) => m.enabled)
    .map((m) => ({
      recipient: payoutAddress,
      maxAmountUsdc: m.priceUsdc ?? "0",
      merchantId: m.id,
    }));
}

/** Root delegation: user Hybrid SC → Butler executor EOA. */
export function buildRootDelegation(params: {
  from: Address;
  to: Address;
  policy: ButlerPolicy;
  environment: SmartAccountsEnvironment;
  butlerEnforcer: Address;
  payoutAddress?: Address;
}): Omit<Delegation, "signature"> {
  const { from, to, policy, environment, butlerEnforcer } = params;
  const payout = params.payoutAddress ?? sellerAddress();
  const rules = buildMerchantRules(policy, payout);
  const dailyMicro = usdcToMicro(policy.dailyLimitUsdc);

  const caveatBuilder = createCaveatBuilder(environment);

  const butlerTerms = encodeButlerSpendTerms(ARC_USDC, rules);
  const caveats = [];

  if (butlerEnforcer !== "0x0000000000000000000000000000000000000000") {
    caveats.push(createCaveat(butlerEnforcer, butlerTerms));
  }

  const timestampCaveat = caveatBuilder.addCaveat("timestamp", {
    afterThreshold: 0n,
    beforeThreshold: BigInt(policy.validUntil),
  });

  const periodCaveat = caveatBuilder.addCaveat("erc20PeriodTransfer", {
    tokenAddress: ARC_USDC,
    periodAmount: dailyMicro,
    periodDuration: 86400n,
    startDate: BigInt(Math.floor(Date.now() / 1000)),
  });

  caveats.push(timestampCaveat, periodCaveat);

  return createDelegation({
    from,
    to,
    environment,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: ARC_USDC,
      maxAmount: dailyMicro,
    },
    caveats,
  });
}

/** Sub-delegation for a specific agent role (orchestrator → executor). */
export function buildAgentSubDelegation(params: {
  from: Address;
  to: Address;
  policy: ButlerPolicy;
  agentRole: string;
  environment: SmartAccountsEnvironment;
  butlerEnforcer: Address;
  parentDelegation: Delegation;
}): Omit<Delegation, "signature"> {
  const agent = params.policy.agents.find((a) => a.role === params.agentRole);
  if (!agent || !agent.enabled) throw new Error(`Agent ${params.agentRole} not enabled`);

  const allowedMerchants = params.policy.merchants.filter(
    (m) => m.enabled && agent.categories.includes(m.category)
  );
  const rules = allowedMerchants.map((m) => ({
    recipient: sellerAddress(),
    maxAmountUsdc: m.priceUsdc ?? "0",
  }));

  const agentDaily = usdcToMicro(agent.dailyLimitUsdc);
  const caveatBuilder = createCaveatBuilder(params.environment);
  const butlerTerms = encodeButlerSpendTerms(ARC_USDC, rules);

  return createDelegation({
    from: params.from,
    to: params.to,
    environment: params.environment,
    parentDelegation: params.parentDelegation,
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: ARC_USDC,
      maxAmount: agentDaily,
    },
    caveats: [
      createCaveat(params.butlerEnforcer, butlerTerms),
      caveatBuilder.addCaveat("timestamp", {
        afterThreshold: 0n,
        beforeThreshold: BigInt(params.policy.validUntil),
      }),
    ],
  });
}

export function buildUsdcTransferExecution(recipient: Address, amountUsdc: string) {
  const amount = usdcToMicro(amountUsdc);
  const callData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: "transfer",
    args: [recipient, amount],
  });
  return { target: ARC_USDC, value: 0n, callData: callData as Hex };
}
