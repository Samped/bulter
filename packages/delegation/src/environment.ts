import type { SmartAccountsEnvironment } from "@metamask/smart-accounts-kit";
import { overrideDeployedEnvironment } from "@metamask/smart-accounts-kit/utils";
import { DELEGATION_FRAMEWORK_V130, ARC_CHAIN_ID, getButlerSpendEnforcer } from "./arc-env.ts";

/** ERC-4337 EntryPoint v0.7 — same address on deterministic MetaMask deployments. */
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032" as const;

/** Build full SmartAccountsEnvironment for Arc from v1.3.0 deterministic addresses. */
export function buildArcSmartAccountsEnvironment(
  butlerEnforcer = getButlerSpendEnforcer()
): SmartAccountsEnvironment {
  const fw = DELEGATION_FRAMEWORK_V130;
  const env: SmartAccountsEnvironment = {
    DelegationManager: fw.DelegationManager,
    EntryPoint: ENTRY_POINT_V07,
    SimpleFactory: fw.SimpleFactory,
    implementations: {
      MultiSigDeleGatorImpl: fw.MultiSigDeleGatorImpl,
      HybridDeleGatorImpl: fw.HybridDeleGatorImpl,
      EIP7702StatelessDeleGatorImpl: fw.EIP7702StatelessDeleGatorImpl,
    },
    caveatEnforcers: {
      AllowedCalldataEnforcer: "0xc2b0d624c1c4319760C96503BA27C347F3260f55",
      AllowedMethodsEnforcer: "0x2c21fD0Cb9DC8445CB3fb0DC5E7Bb0Aca01842B5",
      AllowedTargetsEnforcer: fw.enforcers.AllowedTargets,
      ApprovalRevocationEnforcer: "0xe264F1f09A19505a1ca1a86D5b01E8bFdb64324A",
      ArgsEqualityCheckEnforcer: "0x44B8C6ae3C304213c3e298495e12497Ed3E56E41",
      BlockNumberEnforcer: "0x5d9818dF0AE3f66e9c3D0c5029DAF99d1823ca6c",
      DeployedEnforcer: "0x24ff2AA430D53a8CD6788018E902E098083dcCd2",
      ERC20BalanceChangeEnforcer: "0xcdF6aB796408598Cea671d79506d7D48E97a5437",
      ERC20TransferAmountEnforcer: fw.enforcers.ERC20TransferAmount,
      ERC20StreamingEnforcer: "0x56c97aE02f233B29fa03502Ecc0457266d9be00e",
      ERC721BalanceChangeEnforcer: "0x8aFdf96eDBbe7e1eD3f5Cd89C7E084841e12A09e",
      ERC721TransferEnforcer: "0x3790e6B7233f779b09DA74C72b6e94813925b9aF",
      ERC1155BalanceChangeEnforcer: "0x63c322732695cAFbbD488Fc6937A0A7B66fC001A",
      IdEnforcer: "0xC8B5D93463c893401094cc70e66A206fb5987997",
      LimitedCallsEnforcer: "0x04658B29F6b82ed55274221a06Fc97D318E25416",
      NonceEnforcer: "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f",
      TimestampEnforcer: fw.enforcers.Timestamp,
      ValueLteEnforcer: fw.enforcers.ValueLte,
      NativeTokenTransferAmountEnforcer: "0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320",
      NativeBalanceChangeEnforcer: "0xbD7B277507723490Cd50b12EaaFe87C616be6880",
      NativeTokenStreamingEnforcer: "0xD10b97905a320b13a0608f7E9cC506b56747df19",
      NativeTokenPaymentEnforcer: "0x4803a326ddED6dDBc60e659e5ed12d85c7582811",
      OwnershipTransferEnforcer: "0x7EEf9734E7092032B5C56310Eb9BbD1f4A524681",
      RedeemerEnforcer: "0xE144b0b2618071B4E56f746313528a669c7E65c5",
      SpecificActionERC20TransferBatchEnforcer: "0x6649b61c873F6F9686A1E1ae9ee98aC380c7bA13",
      ERC20PeriodTransferEnforcer: fw.enforcers.ERC20PeriodTransfer,
      NativeTokenPeriodTransferEnforcer: "0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9",
      ExactCalldataBatchEnforcer: "0x982FD5C86BBF425d7d1451f974192d4525113DfD",
      ExactCalldataEnforcer: "0x99F2e9bF15ce5eC84685604836F71aB835DBBdED",
      ExactExecutionEnforcer: "0x146713078D39eCC1F5338309c28405ccf85Abfbb",
      ExactExecutionBatchEnforcer: "0x1e141e455d08721Dd5BCDA1BaA6Ea5633Afd5017",
      MultiTokenPeriodEnforcer: "0xFB2f1a9BD76d3701B730E5d69C3219D42D80eBb7",
    },
  };

  // Register Butler custom enforcer for createCaveat (raw address)
  void butlerEnforcer;
  overrideDeployedEnvironment(ARC_CHAIN_ID, "1.3.0", env);
  return env;
}

export async function isFrameworkDeployed(publicClient: ReturnType<typeof import("./clients.ts").arcPublicClient>) {
  const code = await publicClient.getBytecode({ address: DELEGATION_FRAMEWORK_V130.DelegationManager });
  return !!code && code !== "0x";
}
