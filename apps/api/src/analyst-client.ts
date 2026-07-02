const DEFAULT_COMPLETIONS_ENDPOINT =
  process.env.BUTLER_ANALYST_URL?.trim() ||
  process.env.OPENAI_BASE_URL?.trim() ||
  "https://api.openai.com/v1/chat/completions";

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

export function analystConfigured(): boolean {
  return !!apiKey() && !!analystModel();
}

export function analystModel(): string {
  return process.env.OPENAI_MODEL?.trim() || "";
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(raw);
}

export async function analystJson<T>(system: string, user: string): Promise<T> {
  const key = apiKey();
  if (!key) {
    throw new Error("Analyst service is not configured on this server");
  }

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 45_000);
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
        model: analystModel(),
        temperature: 0.3,
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
      throw new Error(`Analyst service error ${res.status}: ${errText.slice(0, 200)}`);
    }

    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("Analyst service returned an empty response");
    return parseJsonContent(content) as T;
  } finally {
    clearTimeout(timer);
  }
}
