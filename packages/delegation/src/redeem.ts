import {
  createExecution,
  ExecutionMode,
  type Delegation,
} from "@metamask/smart-accounts-kit";
import { encodeDelegations } from "@metamask/smart-accounts-kit/utils";
import { DelegationManager } from "@metamask/smart-accounts-kit/contracts";
import { encodePacked, type Address, type Hex } from "viem";
import { buildUsdcTransferExecution } from "./build-delegation.ts";
import { arcPublicClient, arcWalletClient, sellerAddress } from "./clients.ts";
import { DELEGATION_FRAMEWORK_V130 } from "./arc-env.ts";

/** Redeem ERC-7710 delegation to pay a merchant (USDC transfer from delegator Hybrid SC). */
export async function redeemMerchantPayment(params: {
  delegations: Delegation[][];
  executorPrivateKey: Hex;
  amountUsdc: string;
  recipient?: Address;
  dryRun?: boolean;
}) {
  const recipient = params.recipient ?? sellerAddress();
  const publicClient = arcPublicClient();
  const walletClient = arcWalletClient(params.executorPrivateKey);
  const exec = buildUsdcTransferExecution(recipient, params.amountUsdc);
  const execution = createExecution(exec);

  const permissionContexts = params.delegations.map((chain) => encodeDelegations(chain));
  const modes = params.delegations.map(() => ExecutionMode.SingleDefault);
  const executionCalldatas = params.delegations.map((chain) => {
    const packed = encodePacked(
      ["address", "uint256", "bytes"],
      [execution.target, execution.value ?? 0n, execution.callData]
    );
    return packed;
  });

  if (params.dryRun) {
    return {
      dryRun: true as const,
      permissionContexts,
      modes,
      executionCalldatas,
      delegations: params.delegations,
    };
  }

  await publicClient.simulateContract({
    address: DELEGATION_FRAMEWORK_V130.DelegationManager,
    abi: DelegationManager.abi,
    functionName: "redeemDelegations",
    args: [permissionContexts, modes, executionCalldatas],
    account: walletClient.account,
  });

  const data = DelegationManager.encode.redeemDelegations({
    delegations: params.delegations,
    modes,
    executions: params.delegations.map(() => [execution]),
  });

  const hash = await walletClient.sendTransaction({
    to: DELEGATION_FRAMEWORK_V130.DelegationManager,
    data,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return { hash, receipt, recipient, amountUsdc: params.amountUsdc };
}
