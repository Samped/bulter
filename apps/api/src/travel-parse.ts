/** LLM + local travel brief parsing → structured trip (any city/country). */

import type { TravelTrip } from "./travel-agents.ts";
import { parseTravelTripLocal } from "./travel-agents.ts";

type LlmTrip = {
  origin?: string;
  originCode?: string;
  destination?: string;
  destinationCode?: string;
  departDate?: string;
  returnDate?: string;
  travelers?: number;
  cabin?: string;
};

const tripCache = new Map<string, Promise<TravelTrip>>();

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function completionsUrl(): string {
  return (
    process.env.BUTLER_ANALYST_URL?.trim() ||
    process.env.OPENAI_BASE_URL?.trim() ||
    "https://api.openai.com/v1/chat/completions"
  );
}

function normalizeBrief(brief?: string): string {
  return (brief ?? "").replace(/\s+/g, " ").trim().slice(0, 2_000);
}

/** Prefer the user brief; strip prior agent JSON so routing isn't polluted. */
export function travelBriefForParse(brief?: string, priorContext?: string): string {
  const primary = normalizeBrief(brief);
  if (primary.length >= 8) return primary;
  const prior = (priorContext ?? "")
    .replace(/\{[\s\S]*?\}/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_000);
  return primary || prior;
}

function cacheKey(text: string): string {
  return text.toLowerCase();
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isIata(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z]{3}$/.test(code.trim());
}

function isIsoDay(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function titleCaseCity(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function parseJsonObject(content: string): LlmTrip | null {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (fenced?.[1] ?? trimmed).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as LlmTrip;
  } catch {
    return null;
  }
}

function defaultDates(brief: string): { departDate: string; returnDate: string } {
  const t = brief.toLowerCase();
  const today = new Date();
  let depart = addDays(today, /next week/.test(t) ? 7 : /tomorrow/.test(t) ? 1 : 14);
  let ret = addDays(depart, /weekend/.test(t) ? 3 : 7);
  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) {
    depart = new Date(`${iso[1]}T12:00:00Z`);
    ret = addDays(depart, 7);
  }
  return { departDate: isoDate(depart), returnDate: isoDate(ret) };
}

function coerceTrip(raw: LlmTrip | null, brief: string): TravelTrip | null {
  if (!raw) return null;
  if (!isIata(raw.originCode) || !isIata(raw.destinationCode)) return null;
  const originCode = raw.originCode.trim().toUpperCase();
  const destinationCode = raw.destinationCode.trim().toUpperCase();
  if (originCode === destinationCode) return null;

  const origin = titleCaseCity(typeof raw.origin === "string" && raw.origin.trim() ? raw.origin : originCode);
  const destination = titleCaseCity(
    typeof raw.destination === "string" && raw.destination.trim() ? raw.destination : destinationCode,
  );

  const defaults = defaultDates(brief);
  let departDate = isIsoDay(raw.departDate) ? raw.departDate : defaults.departDate;
  let returnDate = isIsoDay(raw.returnDate) ? raw.returnDate : defaults.returnDate;
  if (returnDate <= departDate) {
    returnDate = isoDate(addDays(new Date(`${departDate}T12:00:00Z`), 7));
  }

  const travelers = Math.min(8, Math.max(1, Number(raw.travelers) || 1));
  const cabinRaw = typeof raw.cabin === "string" ? raw.cabin.toLowerCase() : "economy";
  const cabin = cabinRaw.includes("business")
    ? "business"
    : cabinRaw.includes("premium")
      ? "premium"
      : "economy";

  return {
    origin,
    originCode,
    destination,
    destinationCode,
    departDate,
    returnDate,
    travelers,
    cabin,
  };
}

async function parseTravelTripRemote(brief: string): Promise<TravelTrip | null> {
  const key = apiKey();
  if (!key) return null;
  if (process.env.BUTLER_TRAVEL_LLM_PARSE === "false") return null;

  const defaults = defaultDates(brief);
  const system = `You extract structured flight-trip fields from a traveler's free-text request.
Resolve ANY city or country worldwide to the main commercial airport IATA code
(e.g. Kenya→NBO Nairobi, Qatar→DOH Doha, Nigeria→LOS Lagos, UK→LHR London, Ghana→ACC Accra).
Rules:
- origin = where they depart FROM; destination = where they go TO.
- Never swap origin/destination.
- Never invent a third city (no LAX when the user said Lagos).
- If only a country is named as destination, use that country's main international hub.
- If origin is missing, use a sensible default near the user wording, else JFK.
- Dates: ISO YYYY-MM-DD. If missing, use depart=${defaults.departDate}, return=${defaults.returnDate}.
- cabin: economy | premium | business
- travelers: integer 1–8
Respond with JSON only:
{"origin":"City","originCode":"AAA","destination":"City","destinationCode":"BBB","departDate":"YYYY-MM-DD","returnDate":"YYYY-MM-DD","travelers":1,"cabin":"economy"}`;

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OPENAI_TRAVEL_PARSE_TIMEOUT_MS ?? 20_000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(completionsUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: brief },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn("[travel-parse] upstream", res.status, errText.slice(0, 180));
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    return coerceTrip(content ? parseJsonObject(content) : null, brief);
  } catch (e) {
    console.warn("[travel-parse] failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a travel brief to a structured trip.
 * Prefers ChatGPT for any worldwide city/country; falls back to local rules.
 */
export async function resolveTravelTrip(brief?: string, priorContext?: string): Promise<TravelTrip> {
  const text = travelBriefForParse(brief, priorContext);
  const key = cacheKey(text || "default");
  let pending = tripCache.get(key);
  if (!pending) {
    pending = (async () => {
      const remote = text ? await parseTravelTripRemote(text) : null;
      if (remote) {
        console.log(
          `[travel-parse] llm ${remote.originCode}→${remote.destinationCode} (${remote.origin}→${remote.destination})`,
        );
        return remote;
      }
      const local = parseTravelTripLocal(text);
      console.log(
        `[travel-parse] local ${local.originCode}→${local.destinationCode} (${local.origin}→${local.destination})`,
      );
      return local;
    })().finally(() => {
      setTimeout(() => tripCache.delete(key), 180_000);
    });
    tripCache.set(key, pending);
  }
  return pending;
}
