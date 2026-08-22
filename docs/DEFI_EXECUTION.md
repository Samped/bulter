# DeFi Execution Agent — security model

Butler ships a **plan-first** DeFi Execution Agent (`defi-execution-agent`). It quotes and plans USDC swaps/bridges through **code-owned plugins**. It does **not** broadcast transactions by default.

## Threat model (fail closed)

| Risk | Mitigation |
|------|------------|
| Arbitrary token drain | Token allowlist in `apps/api/src/agents/defi-execution/allowlist.ts` — unknown symbols/addresses hard-block |
| Empty env = allow all | Allowlists are **code**, not env-driven |
| Infinite ERC-20 approve | Plans require exact-amount approve language; broadcast still gated |
| Blind LLM calldata | No model-authored calldata is executed; adapters emit documentary steps only |
| ButlerSpendEnforcer misuse | Enforcer only allows `USDC.transfer` to merchants — **cannot** authorize swaps; agent refuses execute mode |
| Accidental mainnet spend | `BUTLER_DEFI_BROADCAST` default off; mainnet adapters default off |
| Approval bypass | With `BUTLER_DEFI_BROADCAST=true`, `defi-execution-agent` requires explicit agent approval |

## Modes

1. **quote** — indicative routes only  
2. **plan** (default for swap/bridge briefs) — ordered steps + `confirmNonce`  
3. **execute** — always hard-blocked until an audited on-chain enforcer exists **and** broadcast flag + simulation receipt

## Plugins

| Plugin | Role |
|--------|------|
| `cctp-v2` | Circle CCTP USDC burn/mint planner (Arc testnet domain 26 + allowlisted domains) |
| `uniswap-universal-router-stub` | Indicative DEX quotes/plans on allowlisted L2/mainnet — **stub** until live aggregator keys + simulation |

## Caps (code)

- Max notional: **500 USDC** per plan  
- Max slippage: **100 bps** (1%)  
- Min amount: **0.01**

## Env flags

| Variable | Default | Meaning |
|----------|---------|---------|
| `BUTLER_DEFI_BROADCAST` | unset/false | Must be `true` to even consider broadcast (still blocked in code today) |
| `BUTLER_DEFI_MAINNET_ADAPTERS` | unset/false | Enables mainnet adapter path labeling (quotes still indicative) |
| `BUTLER_REQUIRE_AGENT_APPROVAL` | unset/false | Global agent approval gate |

## Example briefs

```
Plan bridge 25 USDC from arc-testnet to base
Quote swap 50 USDC to WETH on base
Plan swap 10 USDC to ETH on arbitrum with slippage 0.5%
```

## Roadmap before live execution

1. Deploy + audit `ButlerDefiExecutionEnforcer` (see `packages/contracts/src/enforcers/ButlerDefiExecutionEnforcer.sol`)  
2. Wire Tenderly / `eth_call` simulation receipts into the execute gate  
3. Replace Uniswap stub with authenticated aggregator (0x / 1inch) behind the same allowlists  
4. Human confirm UI that echoes `confirmNonce` before any redeem  

Until then: **PRO means honest plans, not fake fills.**
