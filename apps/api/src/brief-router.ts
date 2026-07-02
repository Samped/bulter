import {
  MARKETPLACE_AGENTS,
  MARKETPLACE_ETFS,
  buildTaskPlanFromRoute,
  type AgentCreditScore,
  type TaskPlan,
  type TaskStrategy,
} from "@butler/core";

const DEFAULT_COMPLETIONS_ENDPOINT =
  process.env.BUTLER_ANALYST_URL?.trim() ||
  process.env.OPENAI_BASE_URL?.trim() ||
  "https://api.openai.com/v1/chat/completions";
const LOG_PREFIX = "[brief-router]";

export interface BriefRouterStatus {
  enabled: boolean;
  model: string;
}

interface RouteResponse {
  strategy?: TaskStrategy;
  etfId?: string | null;
  agentIds?: string[];
  reason?: string;
}

interface ShapeResponse {
  shape?: "single" | "multi";
  reason?: string;
  suggestedAgentId?: string | null;
  suggestedCategory?: string | null;
}

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "";
}

function catalogForPrompt(credits: AgentCreditScore[]): string {
  const creditById = new Map(credits.map((c) => [c.agentId, c]));
  const agents = MARKETPLACE_AGENTS.map((a) => ({
    id: a.id,
    name: a.name,
    tagline: a.tagline,
    category: a.category,
    capabilities: a.capabilities,
    priceUsdc: a.priceUsdc,
    etaSeconds: a.etaSeconds,
    reputation: creditById.get(a.id)?.score ?? 90,
  }));
  const etfs = MARKETPLACE_ETFS.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    agentIds: e.agentIds,
    bundlePriceUsdc: e.bundlePriceUsdc,
    etaSeconds: e.etaSeconds,
  }));
  return JSON.stringify({ agents, etfs }, null, 2);
}

const ROUTE_SYSTEM_PROMPT = `Select a marketplace execution route for the user task.

Rules:
- Prefer an ETF when the task clearly matches a bundled multi-agent workflow.
- Use "direct" for a single specialist when one agent is enough.
- Use "workflow" for 2–3 agents without a full ETF (e.g. headlines + price).
- news-agent: headlines only. research-agent: papers and executive summaries.
- audit-agent for Solidity and contract review.
- onchain-agent for flows, whales, exchange activity — not news.
- token-research-agent for holder data, tokenomics, unlocks — not news-agent.
- Narrow tasks (headlines, quote, chart, on-chain, holders, audit, bills) must not use ETF.
- Only use agent and ETF ids from the catalog.

Respond with JSON:
{
  "strategy": "etf" | "workflow" | "direct",
  "etfId": string | null,
  "agentIds": string[],
  "reason": "short rationale"
}`;

export function getBriefRouterStatus(): BriefRouterStatus {
  const model = modelName();
  return {
    enabled: !!apiKey() && !!model,
    model: model || "not configured",
  };
}

export function remoteRouterEnabled(): boolean {
  if (process.env.BUTLER_REMOTE_ROUTER === "false") return false;
  if (process.env.BUTLER_AI_PLANNER === "false") return false;
  return getBriefRouterStatus().enabled;
}

function parseJsonPayload<T>(content: string): T | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function chatJson<T>(system: string, user: string, temperature: number, timeoutMs: number): Promise<T | null> {
  const key = apiKey();
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(DEFAULT_COMPLETIONS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`${LOG_PREFIX} upstream ${res.status}`, errText.slice(0, 200));
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    return parseJsonPayload<T>(content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`${LOG_PREFIX} request failed:`, msg);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function taskContext(context?: { qualityTier?: string; auctionMode?: string; category?: string }): string {
  return [
    context?.qualityTier ? `Quality tier: ${context.qualityTier}` : null,
    context?.auctionMode ? `Auction mode: ${context.auctionMode}` : null,
    context?.category ? `Category hint: ${context.category}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function planTaskRemote(
  task: string,
  credits: AgentCreditScore[] = [],
  context?: { qualityTier?: string; auctionMode?: string; category?: string }
): Promise<TaskPlan | null> {
  const ctx = taskContext(context);
  const userContent = ctx ? `${ctx}\n\nTask:\n${task}` : task;
  const parsed = await chatJson<RouteResponse>(
    `${ROUTE_SYSTEM_PROMPT}\n\nCatalog:\n${catalogForPrompt(credits)}`,
    userContent,
    0.2,
    Number(process.env.OPENAI_TIMEOUT_MS ?? 25_000)
  );
  if (!parsed?.strategy || !Array.isArray(parsed.agentIds)) return null;

  const plan = buildTaskPlanFromRoute({
    strategy: parsed.strategy,
    agentIds: parsed.agentIds,
    etfId: parsed.etfId ?? null,
    reason: parsed.reason ?? "Matched catalog route for task.",
    router: "remote",
  });

  if (!plan) {
    console.warn(`${LOG_PREFIX} invalid route`, parsed);
  }
  return plan;
}

const SHAPE_SYSTEM_PROMPT = `Classify whether the task needs one specialist agent or multiple agents.

- single: headlines, price, chart, on-chain, holders, token research, wallet reputation, audit, bills, sentiment.
- multi: full reports, due diligence, explicit multi-agent requests, news+price combos.

Respond JSON:
{
  "shape": "single" | "multi",
  "reason": "short explanation",
  "suggestedAgentId": "agent-id or null",
  "suggestedCategory": "news|market-data|research|reporting|sentiment|audit|bills or null"
}`;

export async function classifyExecutionShapeRemote(
  task: string,
  context?: { qualityTier?: string; auctionMode?: string; category?: string }
): Promise<{
  shape: "single" | "multi";
  reason: string;
  suggestedAgentId?: string;
  suggestedCategory?: string;
} | null> {
  const ctx = taskContext(context);
  const userContent = ctx ? `${ctx}\n\nTask:\n${task}` : task;
  const parsed = await chatJson<ShapeResponse>(
    SHAPE_SYSTEM_PROMPT,
    userContent,
    0.1,
    Number(process.env.OPENAI_SHAPE_TIMEOUT_MS ?? 12_000)
  );
  if (!parsed || (parsed.shape !== "single" && parsed.shape !== "multi")) return null;
  return {
    shape: parsed.shape,
    reason: parsed.reason?.trim() || "Remote shape classification",
    suggestedAgentId: parsed.suggestedAgentId?.trim() || undefined,
    suggestedCategory: parsed.suggestedCategory?.trim() || undefined,
  };
}
