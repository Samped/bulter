# Circle / Arc Feedback — Butler Agentic hub

*Submitted as part of Lepton / Arc OSS. Built on Arc testnet (5042002) with Circle Gateway, x402-batching, Circle CLI, and circle-agent trace patterns. Live: https://getbutler.xyz*

---

## What worked well

### 1. Arc as a payments L1 for autonomous agents

Arc testnet made it realistic to run **hundreds of USDC micropayments** without mocking money. Native USDC (`0x3600…0000`), fast finality, and the Circle faucet let us fund payer wallets and iterate on a 15-agent marketplace where every call is a real settlement.

### 2. x402 + Gateway batching is the right machine API contract

`@circle-fin/x402-batching` gave us a clean pattern: `GET /resource` → `402 Payment Required` → Gateway settle → `200` JSON. Every Butler worker agent (`GET /marketplace/agents/{id}/execute`) uses the same middleware. External agents on the open internet plug into the same probe-and-pay flow (`x402-probe.ts`). This is the right primitive for agent-to-agent commerce.

### 3. Circle CLI agent wallets lowered the payer UX bar

Email OTP login in our dashboard (Circle Payer chip) was much easier than asking users to paste a private key. Pairing CLI login with **faucet + Gateway deposit helpers** (`circleGatewayDepositAsync`) got new payers from zero to a first x402 payment in one session.

### 4. `circle-agent` Arc 101 trace was the right observability layer

Settlement UUID → Gateway transfer → `submitBatch` tx → USDC decode is non-obvious without a reference. We wrapped the same primitives in a **Trace tab** (`/api/settlement/:id`, `/api/batch-tx/:id`, `/api/decode-batch/:hash`) so judges can click through a payment without reading calldata manually. We also sync Gateway transfer history into our Activity ledger (`gateway-ledger-sync.ts`) so off-chain job state matches on-chain settlements.

### 5. `arc-canteen` RPC auth integrated cleanly

`resolveArcRpc()` in `@butler/arc` chains `ARC_TESTNET_RPC` → `~/.arc-canteen/env` → `arc-canteen rpc-url` → public fallback. Authenticated RPC via `arc-canteen login` was smoother than hardcoding endpoints and fits the Lepton ARC CLI checklist.

---

## Where Circle / Arc can improve

### 1. Document the “multi-payment buyer / orchestrator” pattern

Arc repos excel at **accepting** one x402 payment (seller side). Butler had to invent the **buyer side**: orchestrate 3–6 parallel x402 calls per ETF workflow, pass context between steps (`context-store.ts`), merge deliverables, and handle partial failures. A first-party guide — *“How to build an agent that pays many x402 endpoints under a budget”* — would have saved us significant integration time.

### 2. Circle CLI + long-running API servers need an official server-side pattern

When Butler pays via `circle services pay`, the CLI calls back into our API for the x402 resource. On a single Node process this caused **deadlocks and timeouts** when the public URL was proxied (Vercel → VM). We solved it with:

- `BUTLER_INTERNAL_API_URL` — loopback (`127.0.0.1:3001`) for payment callbacks
- `BUTLER_INTERNAL_AGENT_PAY` — run built-in agent handlers in-process instead of re-entering HTTP

This should be a documented deployment recipe, not tribal knowledge discovered in production.

### 3. Gateway balance should be queryable without parsing CLI stdout

Our dashboard shows Gateway USDC via `circle gateway balance` output parsing (`parseGatewayBalanceUsdc`). It works but is fragile across CLI versions. A stable **HTTP or SDK method** for “available Gateway balance for x402” would help any dashboard that shows payer readiness before a Butler run.

### 4. Clearer x402 error taxonomy

When Gateway middleware is misconfigured, we see opaque failures (“invalid x402 402”, incomplete settlement responses). Operators cannot tell **seller misconfig** vs **insufficient Gateway balance** vs **facilitator timeout** without reading server logs. Structured error codes in docs (and in 402/500 responses) would speed debugging — we ended up writing our own mapper in `payment-errors.ts`.

### 5. On-chain vs off-chain state for hackathon deploys

Gateway settlements are durable; local `.data/` (ledger, Library, Circle session) is not. On Render free tier and after VM restarts, **Activity and Library reset** while Trace still shows old settlements. A short Arc doc on *what persists where* (Gateway account vs chain vs app disk) would set correct expectations for demo deploys.

### 6. Boot-time guidance for small instances

Importing `@circle-fin/x402-batching` + full marketplace routes exceeded **460MB RAM** on free tiers. We added `BUTLER_LITE_API` with lazy route loading and split boot phases (`route-loader-status.ts`). An official “lite seller / lite buyer” sample for 512MB VMs would help teams ship live URLs faster.

### 7. x402 probe / discovery primitives

We built `probeX402Url()` to discover price and network from a `402` + `PAYMENT-REQUIRED` header before paying external agents. A small **official probe utility** (or documented header schema + examples) would standardize open-agent registries across hackathon projects.

---

## Summary

**Circle / Arc gave us a credible payments rail** — USDC on Arc, Gateway nanopayments, x402 middleware, CLI wallets, and settlement trace. That stack is production-shaped.

**The gap is orchestration documentation** — how a long-running buyer agent pays many sellers, enforces budgets, survives deploy topologies (proxy + loopback), and reconciles Gateway history with app state. Closing that gap would turn Arc from “great payment demo” into “great agent-commerce platform.”

**Repo:** https://github.com/Samped/bulter  
**Live:** https://getbutler.xyz
