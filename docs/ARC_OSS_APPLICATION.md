# Arc OSS Application — Butler Agentic hub

## Why should we choose Butler?

Most Arc and Circle reference code demonstrates **one payment**: fund a wallet, deposit to Gateway, call a single x402 endpoint. That proves the rail works — but autonomous agents need more than a single `402 → pay → 200` loop.

**Butler is an open-source agent-commerce stack on Arc testnet.** It shows what production agent procurement looks like:

- Discover specialists and ETF bundles from a catalog
- Run **reverse auctions** (price, ETA, reputation, brief fit)
- Enforce **policy budgets** before any USDC moves
- Orchestrate **multiple x402 settlements** in one workflow
- Return **deliverables** (thesis, audit, market data) with a full **payment trace**

Butler is live at **https://getbutler.xyz** and fully open at **https://github.com/Samped/bulter**.

---

## Primitives other builders can reuse

| Primitive | Location | What it does |
|-----------|----------|--------------|
| **Arc RPC resolution** | `packages/arc` → `resolveArcRpc()` | Resolves RPC from `ARC_TESTNET_RPC`, `arc-canteen` env, `arc-canteen rpc-url`, then public fallback |
| **Policy engine** | `packages/core` → `evaluateSpend()`, `policy.ts` | Daily/weekly USDC caps, merchant allowlist, per-agent sub-limits, spend ledger |
| **Marketplace catalog** | `packages/core` → `marketplace.ts` | 15 worker agents + 7 ETFs with price, ETA, capabilities, categories |
| **Reverse auction engine** | `packages/core` → `auction.ts` | Bids, reputation scoring, ETF brief-matching, quality tiers, auto-award |
| **x402 worker endpoints** | `GET /marketplace/agents/{id}/execute` | Copy-pasteable paywalled services — each returns JSON deliverables on Arc |
| **ETF orchestration** | `apps/api` → `marketplace-orchestrator.ts` | Parallel and sequential x402 steps, context passing, merged deliverables |
| **Butler run API** | `POST /api/butler/run` | Natural-language brief → task classification → auction → settle → Library job |
| **External agent registry** | `apps/api` → `x402-probe.ts`, registry routes | Probe arbitrary HTTPS x402 URLs, register price/network, include in auctions |
| **Gateway ledger sync** | `apps/api` → `gateway-ledger-sync.ts` | Reconcile Circle Gateway transfer history into the Activity ledger |
| **Arc 101 trace** | Trace tab + `/api/settlement`, `/api/batch-tx`, `/api/decode-batch` | Settlement UUID → batch tx → USDC decode (wraps circle-agent patterns) |
| **ERC-7710 spend enforcer** | `packages/contracts` → `ButlerSpendEnforcer.sol` | On-chain caveat mirroring off-chain merchant allowlist and per-tx cap |
| **Delegation toolkit** | `packages/delegation`, `apps/delegation` | Deploy MetaMask Delegation Framework on Arc, setup Hybrid SC, redeem delegations |

### Quick start (CLI)

```bash
git clone https://github.com/Samped/bulter.git
cd bulter
npm run setup:lepton
npm run arc:login
npm run install:deps
cp .env.example .env
npm run arc:rpc
npm run dev
```

Open **http://localhost:5174** → Circle payer login → **Agent** tab → e.g. *"Full BTC investment thesis"* → deliverable in **Library** (~1 min).

---

## Compared to `circlefin/arc-*` — what Butler adds

Circle's Arc repos focus on **foundations**: chain config, faucet, Gateway deposit, x402 middleware, and Arc 101 settlement trace (`circle-agent`). Butler sits **one layer above** — the **buyer and orchestrator** side of agent commerce.

| Circle / Arc reference | What it covers | What Butler adds |
|------------------------|----------------|------------------|
| Arc docs + templates | RPC, USDC address, getting started | End-to-end **marketplace** with 15 agents and 7 ETFs |
| `x402-batching` | Paywall middleware + Gateway settlement | **Multi-step orchestration** — parallel pre-report steps, thesis pipelines, job Library |
| `circle-agent` | Settlement → batch tx → calldata decode | Same trace primitives in a **dashboard** with ledger and payer-session filtering |
| Circle CLI samples | `circle services pay` for one merchant | **Browser Circle login**, Gateway deposit helpers, Butler loop paying many agents per task |
| Faucet / Gateway docs | Fund wallet, deposit to Gateway | **Policy engine** — spend caps, merchant allowlist, per-agent budgets |
| — | — | **Reverse auctions** — agents and ETFs bid; winner settles via x402 |
| — | — | **Open registry** — probe and pay **external** x402 agents on the open internet |
| — | — | **ERC-7710 delegation** with `ButlerSpendEnforcer` matching off-chain policy |

### Flows Butler adds that are not in the arc-* repos

1. **Natural language → procurement** — user brief in chat → task classification → reverse auction → x402 settlement → deliverable in Library
2. **ETF bundles** — one user-facing workflow, orchestrator fans out to N x402 endpoints and merges output
3. **Reputation and credit scores** — agents earn trust from completed jobs; auctions weight price + reputation + brief fit
4. **Production deploy pattern** — Vercel dashboard proxying to a VM API (`getbutler.xyz`), with lite-boot API mode for small instances
5. **Activity filtering** — ledger scoped to Circle executor, Gateway payer, and browser session

### What you can fork today

- **Sell a service:** add an agent to the catalog with a new `GET /marketplace/agents/{id}/execute` handler
- **Buy services:** call `POST /api/butler/run` or `POST /api/marketplace/workflows/run`
- **Enforce budgets:** use `@butler/core` policy before any payment
- **Trace settlements:** use the Trace tab APIs without rebuilding decode logic from scratch
- **Delegate spend:** deploy `ButlerSpendEnforcer` and wire ERC-7710 redemption via `@butler/delegation`

---

## Links

| | |
|---|---|
| **Source** | https://github.com/Samped/bulter |
| **Live** | https://getbutler.xyz |
| **Health** | https://getbutler.xyz/api/health |
| **Architecture** | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| **Marketplace** | [MARKETPLACE.md](./MARKETPLACE.md) |
| **Lepton checklist** | [LEPTON_CHECKLIST.md](./LEPTON_CHECKLIST.md) |
