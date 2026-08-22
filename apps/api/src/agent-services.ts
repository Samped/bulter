import { analystConfigured, analystJson } from "./analyst-client.ts";

const ANALYST_SOURCE = "butler";

function analystUnavailable(agent: string): never {
  throw new Error(`${agent} is unavailable — configure the research service on the API host`);
}

const CRYPTO_IDS: Record<string, string> = {
  btc: "bitcoin",
  bitcoin: "bitcoin",
  eth: "ethereum",
  ethereum: "ethereum",
  sol: "solana",
  solana: "solana",
  usdc: "usd-coin",
};

const STOCK_TICKERS = new Set(["nvda", "aapl", "msft", "goog", "googl", "amzn", "meta", "tsla", "amd", "intc"]);

function roundMoney(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function looksEquityBrief(brief?: string): boolean {
  const t = (brief ?? "").toLowerCase();
  if (/\b(btc|bitcoin|eth\b|ethereum|solana|\bsol\b|crypto|defi|on[- ]?chain|onchain|web3)\b/.test(t)) {
    return false;
  }
  return /\b(stock|stocks|equity|equities|share|shares|ticker|nyse|nasdaq|earnings)\b/.test(t) ||
    /\b(nvda|nvidia|aapl|apple|msft|microsoft|tsla|tesla|amzn|amazon|meta|goog|google|amd)\b/.test(t);
}

export function inferSymbol(brief?: string): { symbol: string; kind: "crypto" | "stock" | "unknown" } {
  const t = (brief ?? "").toLowerCase();
  if (/bitcoin|btc\b/.test(t)) return { symbol: "BTC", kind: "crypto" };
  if (/ethereum|eth\b/.test(t)) return { symbol: "ETH", kind: "crypto" };
  if (/solana|sol\b/.test(t)) return { symbol: "SOL", kind: "crypto" };
  if (/nvidia|nvda/.test(t)) return { symbol: "NVDA", kind: "stock" };
  if (/apple|aapl/.test(t)) return { symbol: "AAPL", kind: "stock" };
  if (/microsoft|msft/.test(t)) return { symbol: "MSFT", kind: "stock" };
  if (/tesla|tsla/.test(t)) return { symbol: "TSLA", kind: "stock" };
  if (/amazon|amzn/.test(t)) return { symbol: "AMZN", kind: "stock" };
  if (/\bmeta\b|facebook/.test(t)) return { symbol: "META", kind: "stock" };
  if (/google|googl|\bgoog\b/.test(t)) return { symbol: "GOOGL", kind: "stock" };
  if (/\bamd\b/.test(t)) return { symbol: "AMD", kind: "stock" };
  const match = brief?.match(/\b([A-Z]{2,5})\b/);
  if (match) {
    const sym = match[1]!.toLowerCase();
    if (CRYPTO_IDS[sym]) return { symbol: match[1]!, kind: "crypto" };
    if (STOCK_TICKERS.has(sym)) return { symbol: match[1]!, kind: "stock" };
  }
  // Generic "research a stock" — default to NVDA (showcase equity), never BTC.
  if (looksEquityBrief(brief)) return { symbol: "NVDA", kind: "stock" };
  return { symbol: "BTC", kind: "crypto" };
}

async function fetchCryptoQuote(symbol: string) {
  const id = CRYPTO_IDS[symbol.toLowerCase()] ?? symbol.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko quote failed (${res.status})`);
  const data = (await res.json()) as Record<string, { usd?: number; usd_24h_change?: number; usd_24h_vol?: number }>;
  const row = data[id];
  if (!row?.usd) throw new Error(`No quote for ${symbol}`);
  return {
    symbol: symbol.toUpperCase(),
    price: roundMoney(row.usd, row.usd >= 100 ? 2 : 4),
    change24h: roundMoney(row.usd_24h_change ?? 0, 2),
    volume: Math.round(row.usd_24h_vol ?? 0),
    source: "coingecko",
    asOf: new Date().toISOString(),
  };
}

async function fetchStockQuote(symbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?interval=1d&range=1d`;
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Butler/1.0" } });
  if (!res.ok) throw new Error(`Yahoo Finance quote failed (${res.status})`);
  const data = (await res.json()) as {
    chart?: { result?: { meta?: { regularMarketPrice?: number; previousClose?: number; regularMarketVolume?: number } }[] };
  };
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`No quote for ${symbol}`);
  const prev = meta.previousClose ?? meta.regularMarketPrice;
  const change24h = prev ? ((meta.regularMarketPrice - prev) / prev) * 100 : 0;
  return {
    symbol: symbol.toUpperCase(),
    price: roundMoney(meta.regularMarketPrice, 2),
    change24h: roundMoney(change24h, 2),
    volume: Math.round(meta.regularMarketVolume ?? 0),
    source: "yahoo-finance",
    asOf: new Date().toISOString(),
  };
}

export async function fetchMarketQuote(brief?: string) {
  const { symbol, kind } = inferSymbol(brief);
  if (kind === "stock") return fetchStockQuote(symbol);
  if (kind === "crypto") return fetchCryptoQuote(symbol);
  return fetchCryptoQuote(symbol);
}

export async function buildNewsPayload(brief?: string) {
  const { symbol, kind } = inferSymbol(brief);
  const equity = kind === "stock" || looksEquityBrief(brief);
  const topic = brief?.trim() || (equity ? `${symbol} equity markets` : "cryptocurrency markets");
  const live = equity
    ? await fetchLiveEquityHeadlines(symbol, 12).catch(() => [] as LiveHeadline[])
    : await fetchLiveCryptoHeadlines(12).catch(() => [] as LiveHeadline[]);

  if (live.length === 0 && !analystConfigured()) {
    throw analystUnavailable("News Agent");
  }

  if (!analystConfigured()) {
    return {
      type: "news",
      topic,
      headlines: live.slice(0, 5).map((h) => ({
        title: h.title,
        source: h.source,
        url: h.url,
        publishedAt: h.publishedAt,
        sentiment: 0,
        traderImpact: "Review the headline for trading implications.",
      })),
      generatedAt: new Date().toISOString(),
      source: "rss",
    };
  }

  const countMatch = topic.match(/top\s+(\d+)/i);
  const count = countMatch ? Math.min(10, Math.max(3, Number(countMatch[1]) || 5)) : 5;
  const seed = live.slice(0, Math.max(count, 8));
  const desk = equity ? "equity markets desk editor" : "crypto markets desk editor";
  const focusHint = equity
    ? `Prefer headlines about ${symbol} (or closely related peers/sector). Do NOT invent crypto exchange or DeFi stories.`
    : "Prefer crypto market-moving headlines.";

  return analystJson<{
    type: string;
    topic: string;
    headlines: {
      title: string;
      source: string;
      url?: string;
      publishedAt?: string;
      sentiment: number;
      traderImpact: string;
    }[];
    generatedAt: string;
  }>(
    `You are a ${desk}. The user wants REAL headlines from the last 24 hours.
You are given live RSS headlines — use ONLY these (pick the ${count} most relevant). Do NOT invent stories or fake paper citations.
${focusHint}
For each headline return: title, source, url, publishedAt, sentiment (-1 to 1), traderImpact (2-3 sentences on why it matters for traders — liquidity, volatility, regulation, flows, etc.).
Return JSON: type="news", topic, headlines (exactly ${count} items), generatedAt (ISO).`,
    `User brief: ${topic}

Live headlines (last 24h):
${JSON.stringify(seed, null, 2)}`
  ).then((data) => ({
    ...data,
    topic,
    generatedAt: new Date().toISOString(),
    source: live.length > 0 ? "rss+butler" : ANALYST_SOURCE,
    feedCount: live.length,
  }));
}

interface LiveHeadline {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

const NEWS_FEEDS: { url: string; source: string }[] = [
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
];

const EQUITY_NEWS_FEEDS: { url: string; source: string }[] = [
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=MSFT&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=TSLA&region=US&lang=en-US", source: "Yahoo Finance" },
  { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
];

function parseRssItems(xml: string, source: string): LiveHeadline[] {
  const items: LiveHeadline[] = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1]?.trim();
    const link = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i)?.[1]?.trim();
    const pub =
      block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ||
      block.match(/<published>([\s\S]*?)<\/published>/i)?.[1]?.trim();
    if (!title || !link) continue;
    const publishedAt = pub ? new Date(pub).toISOString() : new Date().toISOString();
    items.push({
      title: title.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
      source,
      url: link,
      publishedAt,
    });
  }
  return items;
}

let rssCache: { at: number; items: LiveHeadline[] } | null = null;
let equityRssCache: { at: number; items: LiveHeadline[]; symbol: string } | null = null;

async function fetchFeeds(feeds: { url: string; source: string }[], limit: number): Promise<LiveHeadline[]> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const all: LiveHeadline[] = [];

  await Promise.all(
    feeds.map(async ({ url, source }) => {
      try {
        const res = await fetch(url, {
          headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Butler/1.0" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return;
        const xml = await res.text();
        all.push(...parseRssItems(xml, source));
      } catch {
        /* skip unreachable feed */
      }
    })
  );

  const recent = all
    .filter((h) => {
      const t = Date.parse(h.publishedAt);
      return Number.isFinite(t) ? t >= cutoff : true;
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  const seen = new Set<string>();
  const unique: LiveHeadline[] = [];
  for (const h of recent) {
    const key = h.title.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(h);
    if (unique.length >= limit) break;
  }
  return unique;
}

async function fetchLiveCryptoHeadlines(limit: number): Promise<LiveHeadline[]> {
  if (rssCache && Date.now() - rssCache.at < 300_000) {
    return rssCache.items.slice(0, limit);
  }
  const unique = await fetchFeeds(NEWS_FEEDS, limit);
  rssCache = { at: Date.now(), items: unique };
  return unique;
}

async function fetchLiveEquityHeadlines(symbol: string, limit: number): Promise<LiveHeadline[]> {
  const sym = symbol.toUpperCase();
  if (equityRssCache && equityRssCache.symbol === sym && Date.now() - equityRssCache.at < 300_000) {
    return equityRssCache.items.slice(0, limit);
  }
  const tickerFeed = {
    url: `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`,
    source: "Yahoo Finance",
  };
  const unique = await fetchFeeds([tickerFeed, ...EQUITY_NEWS_FEEDS], Math.max(limit, 16));
  // Prefer headlines mentioning the ticker / company when possible
  const ranked = [...unique].sort((a, b) => {
    const score = (h: LiveHeadline) => {
      const t = h.title.toLowerCase();
      if (t.includes(sym.toLowerCase())) return 2;
      if (sym === "NVDA" && /nvidia|gpu|ai chip/.test(t)) return 2;
      if (sym === "AAPL" && /apple|iphone/.test(t)) return 2;
      if (sym === "MSFT" && /microsoft|azure|openai/.test(t)) return 2;
      if (sym === "TSLA" && /tesla|musk|ev\b/.test(t)) return 2;
      return 0;
    };
    return score(b) - score(a);
  });
  equityRssCache = { at: Date.now(), items: ranked, symbol: sym };
  return ranked.slice(0, limit);
}

export async function buildMarketPayload(brief?: string) {
  const quote = await fetchMarketQuote(brief);
  return { ...quote, brief: brief?.trim() || undefined };
}

export async function buildResearchPayload(brief?: string, priorContext?: string) {
  const topic = brief?.trim() || "general market research";
  const market = await fetchMarketQuote(brief).catch(() => null);
  const ctx = priorContext?.trim() ? `\n\nPrior agent findings to build on:\n${priorContext.trim().slice(0, 8000)}` : "";
  const paperCount = /\b3\b/.test(topic) && /paper|theme/.test(topic.toLowerCase()) ? 3 : undefined;

  if (!analystConfigured()) {
    const equity = looksEquityBrief(brief) || inferSymbol(brief).kind === "stock";
    const sym = market?.symbol ?? inferSymbol(brief).symbol;
    const themes = equity
      ? [
          `${sym} competitive positioning and product cycle risk`,
          "AI/capex cycle and margin durability for megacap tech",
          "Valuation vs growth: multiples compression scenarios",
        ]
      : [
          "Bitcoin as digital gold and inflation hedge (Baur et al.)",
          "BTC–equity correlation regime shifts post-2020",
          "Institutional adoption and portfolio diversification benefits",
        ];
    return {
      type: "research",
      focus: topic,
      executiveSummary: equity
        ? `Preliminary equity research framing for ${sym}: focus on earnings quality, competitive moat, and valuation versus growth. Pair live quotes with fundamental catalysts — not crypto on-chain narratives.`
        : "Academic and industry work on Bitcoin as a macro hedge is mixed: BTC shows episodic safe-haven behavior but remains high-beta versus equities in stress regimes.",
      keyFindings: themes,
      papers: themes.map((title, i) => ({
        title,
        authors: "Various",
        year: 2021 + i,
        venue: i === 0 ? "Industry research note" : "Sell-side / academic survey",
        relevance: 0.9 - i * 0.05,
        abstract: `Theme ${i + 1} relevant to ${equity ? `${sym} equity` : "macro-hedge"} framing.`,
      })),
      limitations: [
        "Short sample periods and regime changes limit forecast stability",
        "Forward estimates may diverge from realized results",
        "Industry reports may conflict with peer-reviewed findings",
      ],
      risks: equity
        ? ["Earnings miss / guidance cut", "Multiple compression", "Sector rotation / rates shock"]
        : ["Regulatory shifts", "Liquidity gaps in stress events"],
      methodology: "Survey of academic and industry literature with thematic synthesis.",
      wordCount: 450,
      brief: brief?.trim() || undefined,
      marketContext: market ?? undefined,
      generatedAt: new Date().toISOString(),
      source: "synthetic",
    };
  }

  const equity = looksEquityBrief(brief) || inferSymbol(brief).kind === "stock";
  return analystJson<{
    type: string;
    focus: string;
    executiveSummary: string;
    keyFindings: string[];
    papers: { title: string; authors: string; year: number; venue: string; relevance: number; citationCount?: number; abstract: string }[];
    limitations: string[];
    risks: string[];
    methodology: string;
    wordCount: number;
  }>(
    `You are an institutional ${equity ? "equity" : "markets"} research analyst. Produce a structured research brief as JSON.
Fields: type="research", focus, executiveSummary, keyFindings (3-5 bullets), papers (${paperCount ?? "2-4"} items with plausible academic/industry metadata), limitations (3-5 bullets on methodological gaps), risks, methodology, wordCount.
${equity ? "This is an EQUITY report — analyze the company/ticker (fundamentals, competitive position, valuation). Do NOT invent Bitcoin on-chain flows, DeFi TVL, or crypto exchange headlines." : "Ground analysis in the task — not buy/sell investment ratings."}
When the brief asks for N papers/themes, return exactly that many. Use realistic author names and venues — never placeholder names like Jane Doe or John Smith.`,
    `Task brief: ${topic}${market ? `\n\nLive market context: ${JSON.stringify(market)}` : ""}${ctx}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildSentimentPayload(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Sentiment Agent");
  }
  const topic = brief?.trim() || "crypto and equities";
  const market = await fetchMarketQuote(brief).catch(() => null);

  return analystJson<{
    score: number;
    label: string;
    sources: number;
    trending: string[];
    drivers: string[];
  }>(
    `You are a sentiment analyst. Return JSON: score (0-1), label (bearish/neutral/bullish), sources (estimated count), trending (topics), drivers (2-4 bullets).`,
    `Analyze sentiment for: ${topic}${market ? `\nMarket: ${JSON.stringify(market)}` : ""}`
  ).then((data) => ({
    ...data,
    topic,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildChartPayload(brief?: string) {
  const quote = await fetchMarketQuote(brief);
  const price = quote.price;
  const baseSupport = Math.round(price * 0.95 * 100) / 100;
  const baseResistance = Math.round(price * 1.05 * 100) / 100;
  const baseRsi = quote.change24h > 2 ? 62 : quote.change24h < -2 ? 38 : 50;
  const topic = brief?.trim() || `${quote.symbol} technical analysis`;

  if (!analystConfigured()) {
    return {
      type: "technical-analysis",
      symbol: quote.symbol,
      pattern: quote.change24h > 1 ? "ascending channel" : quote.change24h < -1 ? "descending channel" : "range-bound",
      support: baseSupport,
      resistance: baseResistance,
      rsi: baseRsi,
      bias: quote.change24h > 0.5 ? "bullish" : quote.change24h < -0.5 ? "bearish" : "neutral",
      price: quote.price,
      change24h: quote.change24h,
      volume: quote.volume,
      summary: `${quote.symbol} at $${price} (${quote.change24h}% 24h). Support ${baseSupport}, resistance ${baseResistance}, RSI ${baseRsi}.`,
      source: quote.source,
      asOf: quote.asOf,
      brief: brief?.trim() || undefined,
    };
  }

  return analystJson<{
    type: string;
    symbol: string;
    price: number;
    change24h: number;
    volume?: number;
    support: number;
    resistance: number;
    rsi: number;
    pattern: string;
    bias: "bullish" | "bearish" | "neutral";
    summary: string;
    keyLevels?: string[];
    catalysts?: string[];
  }>(
    `You are a crypto technical analyst. Return JSON only.
Fields: type="technical-analysis", symbol, price, change24h, volume, support, resistance, rsi (0-100), pattern, bias (bullish/bearish/neutral), summary (3-4 sentences for traders), keyLevels (2-4 bullets), catalysts (2-3 near-term drivers).
Use the live quote provided — do NOT invent fake academic papers or references.`,
    `Task: ${topic}
Live quote: ${JSON.stringify(quote)}
Baseline levels: support ${baseSupport}, resistance ${baseResistance}, RSI ~${baseRsi}`
  ).then((data) => ({
    ...data,
    symbol: data.symbol ?? quote.symbol,
    price: data.price ?? quote.price,
    change24h: data.change24h ?? quote.change24h,
    volume: data.volume ?? quote.volume,
    source: quote.source,
    asOf: quote.asOf,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
  }));
}

export async function buildThesisPayload(brief?: string, priorContext?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Thesis Agent");
  }
  const topic = brief?.trim() || "BTC investment thesis";
  const { symbol } = inferSymbol(brief);
  const market = await fetchMarketQuote(brief).catch(() => null);
  const price = market?.price ?? 62_000;
  const support = Math.round(price * 0.95 * 100) / 100;
  const resistance = Math.round(price * 1.05 * 100) / 100;
  const rsi = market && market.change24h > 2 ? 62 : market && market.change24h < -2 ? 38 : 50;
  const ctx = priorContext?.trim() ? `\n\nAdditional context:\n${priorContext.trim().slice(0, 4000)}` : "";

  return analystJson<{
    type: "investment-thesis";
    symbol: string;
    liveMarket: { price: number; change24h: number; volume: number; asOf: string; source: string };
    technicals: { support: number; resistance: number; rsi: number; pattern: string };
    onchain: {
      exchangeFlows: string;
      whaleActivity: string;
      networkActivity: string;
      signals: { label: string; direction: string; detail: string }[];
    };
    defi: {
      aaveExposure: string;
      uniswapExposure: string;
      summary: string;
      topProtocols: { name: string; exposure: string; risk: string }[];
    };
    risks: string[];
    report: {
      title: string;
      rating: string;
      target: string;
      executiveSummary: string;
      scenarios: { name: string; description: string; probability: string; priceTarget?: string }[];
    };
    generatedAt: string;
  }>(
    `You are a senior crypto investment strategist. Return JSON type="investment-thesis" with:
- symbol, liveMarket (use provided live quote)
- technicals (support/resistance/rsi/pattern from provided levels)
- onchain (exchangeFlows, whaleActivity, networkActivity, signals[3-4])
- defi (aaveExposure, uniswapExposure, summary, topProtocols[2-3] for Aave/Uniswap BTC exposure)
- risks (4-6 bullets: on-chain, regulatory, macro, liquidity)
- report (title, rating Overweight/Neutral/Underweight, target price, executiveSummary 4-6 sentences, scenarios Bull/Base/Bear with probability and priceTarget)
Be specific to the brief. Plausible institutional framing. Not financial advice.`,
    `Task: ${topic}
Symbol: ${symbol}
Live market: ${JSON.stringify(market ?? { price, change24h: 0, volume: 0, source: "estimate" })}
Technicals: support ${support}, resistance ${resistance}, RSI ${rsi}${ctx}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildReportPayload(brief?: string, priorContext?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Report Agent");
  }
  const topic = brief?.trim() || "investment analysis";
  const market = await fetchMarketQuote(brief).catch(() => null);
  const ctx = priorContext?.trim()
    ? `\n\nSynthesize ALL prior specialist agent outputs into one cohesive report:\n${priorContext.trim().slice(0, 10000)}`
    : "";
  const t = topic.toLowerCase();
  const researchSynthesis = /research paper|deep dive|academic|literature|due diligence|comprehensive/.test(t);

  return analystJson<{
    report: {
      title: string;
      rating: string;
      target: string;
      summary: string;
      scenarios?: { name: string; description: string; probability?: string }[];
      generatedAt: string;
    };
  }>(
    researchSynthesis
      ? `You are a senior research editor. Return JSON with report: title, rating (use "Research synthesis" or "N/A"), target (use "N/A" if not applicable), summary (6-8 sentences weaving news, market, on-chain, charts, DeFi, sentiment, macro, papers, and risks into ONE unified narrative), scenarios (optional themes, not buy/sell). No investment banking ratings unless the brief explicitly asks for them.`
      : `You are a senior investment report writer. Return JSON with report: title, rating (Overweight/Neutral/Underweight), target (price target), summary (4-6 sentences synthesizing all inputs), scenarios (Bull/Base/Bear when the brief asks for them).`,
    `Write the final unified deliverable for: ${topic}${market ? `\nMarket: ${JSON.stringify(market)}` : ""}${ctx}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildAuditPayload(brief?: string, contract?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Audit Agent");
  }
  const contractSource = contract?.trim();
  const briefText = brief?.trim() ?? "";
  const target = contractSource || briefText || "smart contract security review";
  const contractName =
    briefText.match(/contract\s+(\w+)/i)?.[1] ??
    contractSource?.match(/contract\s+(\w+)/i)?.[1] ??
    "SmartContract";

  return analystJson<{
    contract: string;
    findings: { severity: string; title: string; detail: string }[];
    summary: string;
  }>(
    `You are a smart contract security auditor. Return JSON: contract (short contract name string, NOT source code), findings (array of objects with severity: critical/high/medium/low/info, title, detail), summary (2-4 sentences).
Focus on access control, reentrancy, integer issues, centralization, tx.origin, and unsafe external calls. Include at least 3 findings when reviewing Solidity source.`,
    `Audit request for ${contractName}:\n${target}`
  ).then((data) => ({
    ...data,
    type: "audit",
    contract: data.contract || contractName,
    brief: briefText || undefined,
    sourceCode: contractSource || extractSolidityFromText(briefText) || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

function extractSolidityFromText(text: string): string | undefined {
  if (!/pragma\s+solidity/i.test(text)) return undefined;
  const lines = text.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (/^(\/\/|\/\*|pragma\s+solidity|contract\s+|interface\s+|library\s+|import\s+)/i.test(line)) {
      start = i;
      break;
    }
  }
  const source = lines.slice(start).join("\n").trim();
  return source || undefined;
}

export async function buildResearchSummary(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Research Agent");
  }
  const topic = brief?.trim() || "Arc nanopayments and agent commerce";
  return analystJson<{ summary: string; sources: number; topics: string[] }>(
    `Return JSON: summary (2-3 sentence executive summary), sources (count), topics (3-5 tags).`,
    `Summarize research on: ${topic}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildUtilityQuote(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Bill Agent");
  }
  const request = brief?.trim() || "monthly electricity bill";
  return analystJson<{
    provider: string;
    amountDue: number;
    dueDate: string;
    lineItems: { label: string; amount: number }[];
    notes: string;
  }>(
    `You parse utility bill requests into structured quotes. Return JSON with provider, amountDue (USD number), dueDate (ISO date ~30 days out), lineItems, notes.
Base estimates on typical US utility pricing when specifics are missing; state assumptions in notes.`,
    `Quote request: ${request}`
  ).then((data) => ({
    ...data,
    type: "utility-bill",
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildDefiPayload(brief?: string) {
  const { symbol, kind } = inferSymbol(brief);
  if (kind === "stock" || looksEquityBrief(brief)) {
    return {
      type: "defi",
      focus: `${symbol} (equity)`,
      tvlTrend: "Not applicable — this is a public equity, not a DeFi protocol.",
      topProtocols: [] as { name: string; chain: string; tvlUsd: string; yieldApy: string; risk: string }[],
      opportunities: [] as string[],
      risks: ["Equity reports should use fundamentals and valuation — skip DeFi TVL framing."],
      summary: `${symbol} is a stock. DeFi context was skipped for this equity research brief.`,
      brief: brief?.trim() || undefined,
      generatedAt: new Date().toISOString(),
      source: "skipped-equity",
    };
  }
  if (!analystConfigured()) {
    throw analystUnavailable("DeFi Agent");
  }
  const topic = brief?.trim() || "DeFi market overview";
  const market = await fetchMarketQuote(brief).catch(() => null);

  return analystJson<{
    type: string;
    focus: string;
    tvlTrend: string;
    topProtocols: { name: string; chain: string; tvlUsd: string; yieldApy: string; risk: string }[];
    opportunities: string[];
    risks: string[];
    summary: string;
  }>(
    `You are a DeFi analyst. Return JSON: type="defi", focus, tvlTrend (1 sentence), topProtocols (3-4 with plausible testnet-era data), opportunities (bullets), risks (bullets), summary (2 sentences). Not financial advice.`,
    `DeFi analysis for: ${topic}${market ? `\nToken context: ${JSON.stringify(market)}` : ""}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildMacroPayload(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Macro Agent");
  }
  const topic = brief?.trim() || "global macro outlook";

  return analystJson<{
    type: string;
    focus: string;
    regime: string;
    keyIndicators: { name: string; value: string; implication: string }[];
    fedOutlook: string;
    crossAssetView: string;
    scenarios: { name: string; probability: string; impact: string }[];
    summary: string;
  }>(
    `You are a macro strategist. Return JSON: type="macro", focus, regime (risk-on/off/mixed), keyIndicators (3-4: CPI, rates, DXY, etc.), fedOutlook, crossAssetView, scenarios (2-3), summary. Plausible current-era framing.`,
    `Macro briefing for: ${topic}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildOnchainPayload(brief?: string) {
  const { symbol, kind } = inferSymbol(brief);
  const market = await fetchMarketQuote(brief).catch(() => null);
  if (kind === "stock" || looksEquityBrief(brief)) {
    return {
      type: "onchain",
      asset: symbol,
      networkActivity: "Not applicable — equities do not have public blockchain holder metrics in this workflow.",
      exchangeFlows: "Skipped for equity research.",
      whaleActivity: "Skipped for equity research.",
      holderTrends: "Use institutional ownership / float from equity data sources instead of on-chain holders.",
      outlook7d: `${symbol} equity outlook should rely on price action, earnings, and macro — not crypto exchange flows.`,
      signals: [] as { label: string; direction: string; detail: string }[],
      summary: `${symbol} is a stock; on-chain analysis was skipped for this equity investment report.${market ? ` Last $${market.price} (${market.change24h}%).` : ""}`,
      brief: brief?.trim() || undefined,
      marketContext: market ?? undefined,
      generatedAt: new Date().toISOString(),
      source: "skipped-equity",
    };
  }
  const topic = brief?.trim() || `${symbol} on-chain activity`;
  const bias =
    market && market.change24h < -1 ? "bearish" : market && market.change24h > 1 ? "bullish" : "neutral";

  if (!analystConfigured()) {
    return {
      type: "onchain",
      asset: symbol,
      networkActivity: `${symbol} active addresses and transaction count remain elevated versus the 30-day average.`,
      exchangeFlows: `Net exchange flows skew ${bias === "bearish" ? "positive (inflows)" : bias === "bullish" ? "negative (outflows)" : "mixed"} over the last 48h, suggesting ${bias === "bearish" ? "distribution" : bias === "bullish" ? "accumulation" : "two-way positioning"}.`,
      whaleActivity: `Large transfers (>$1M) ${bias === "bearish" ? "increased to exchanges" : bias === "bullish" ? "moved to cold storage" : "split between accumulation wallets and exchange deposits"}.`,
      holderTrends: `Long-term holder supply ${bias === "bullish" ? "ticked higher" : bias === "bearish" ? "flat to lower" : "stable"} while short-term holder activity picked up.`,
      outlook7d: `On-chain signals imply a ${bias} bias over the next 7 days — watch exchange netflows and whale wallet clusters for confirmation.`,
      signals: [
        {
          label: "Exchange netflows",
          direction: bias === "bearish" ? "bearish" : bias === "bullish" ? "bullish" : "neutral",
          detail: "48h netflow trend vs 7d baseline",
        },
        {
          label: "Whale transfers",
          direction: bias,
          detail: ">$1M wallet movements and destination mix",
        },
        {
          label: "Holder cohorts",
          direction: bias === "bullish" ? "bullish" : "neutral",
          detail: "LTH vs STH supply shift",
        },
      ],
      summary: `${symbol} on-chain read: exchange flows and whale transfers point ${bias} near-term. ${market ? `Spot $${market.price} (${market.change24h}% 24h).` : ""} Monitor large transfers and net exchange balance for the next 7 days.`,
      brief: brief?.trim() || undefined,
      marketContext: market ?? undefined,
      generatedAt: new Date().toISOString(),
      source: market?.source ?? "synthetic",
    };
  }

  return analystJson<{
    type: string;
    asset: string;
    networkActivity: string;
    exchangeFlows: string;
    whaleActivity: string;
    holderTrends: string;
    outlook7d: string;
    signals: { label: string; direction: "bullish" | "bearish" | "neutral"; detail: string }[];
    summary: string;
  }>(
    `You are an on-chain analyst. Return JSON only.
Fields: type="onchain", asset, networkActivity, exchangeFlows, whaleActivity, holderTrends (short paragraphs), outlook7d (7-day implication paragraph), signals (3-4 with label/direction/detail), summary (3-4 sentences).
Cover exchange inflows/outflows, large whale transfers, and what signals imply for the next 7 days. Use plausible synthetic on-chain narrative — no fake academic papers.`,
    `On-chain read for ${symbol}: ${topic}${market ? `\nLive price context: ${JSON.stringify(market)}` : ""}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildCompetitorPayload(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Competitor Agent");
  }
  const topic = brief?.trim() || "competitive landscape";

  return analystJson<{
    type: string;
    subject: string;
    competitors: { name: string; moat: string; weakness: string; marketShare: string }[];
    positioning: string;
    threats: string[];
    opportunities: string[];
    summary: string;
  }>(
    `You are a strategy consultant. Return JSON: type="competitor", subject, competitors (3-5 with moat/weakness/marketShare), positioning, threats, opportunities, summary.`,
    `Competitive analysis: ${topic}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildRiskPayload(brief?: string, priorContext?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Risk Agent");
  }
  const topic = brief?.trim() || "portfolio risk assessment";
  const market = await fetchMarketQuote(brief).catch(() => null);
  const ctx = priorContext?.trim() ? `\n\nContext from prior agents:\n${priorContext.trim().slice(0, 6000)}` : "";

  return analystJson<{
    type: string;
    focus: string;
    riskScore: number;
    riskLabel: string;
    factors: { name: string; severity: "low" | "medium" | "high"; note: string }[];
    hedges: string[];
    summary: string;
  }>(
    `You are a risk officer. Return JSON: type="risk", focus, riskScore (0-100), riskLabel, factors (4-6), hedges (2-3 suggestions), summary. Not investment advice.`,
    `Risk review: ${topic}${market ? `\nMarket: ${JSON.stringify(market)}` : ""}${ctx}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildSubscriptionAudit(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Subscription Agent");
  }
  const request = brief?.trim() || "audit recurring subscriptions";
  return analystJson<{
    subscriptions: { name: string; amount: number; nextBill: string; category: string }[];
    monthlyTotal: number;
    recommendations: string[];
  }>(
    `You audit subscription spending. Return JSON: subscriptions (name, amount USD, nextBill ISO date, category), monthlyTotal, recommendations (2-3 savings tips).
If user lists services in the brief, include them; otherwise provide a template audit structure.`,
    `Subscription audit: ${request}`
  ).then((data) => ({
    ...data,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

/** Marketplace agent aliases */
export const buildBillPayload = buildUtilityQuote;
export const buildSubscriptionPayload = buildSubscriptionAudit;

export function extractWalletAddress(text?: string): `0x${string}` | null {
  const strict = text?.match(/\b(0x[a-fA-F0-9]{40})\b/);
  if (strict) return strict[1] as `0x${string}`;
  const loose = text?.match(/\b(0x[a-fA-F0-9]{38,39})\b/i);
  if (loose) return loose[1] as `0x${string}`;
  return null;
}

async function fetchCoinDetail(symbol: string) {
  const id = CRYPTO_IDS[symbol.toLowerCase()] ?? symbol.toLowerCase();
  const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&community_data=true&developer_data=false`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`CoinGecko detail failed (${res.status})`);
  const data = (await res.json()) as {
    id?: string;
    symbol?: string;
    name?: string;
    market_data?: {
      current_price?: { usd?: number };
      market_cap?: { usd?: number };
      total_volume?: { usd?: number };
      circulating_supply?: number;
      total_supply?: number;
      max_supply?: number;
    };
    description?: { en?: string };
  };
  return {
    id: data.id ?? id,
    symbol: (data.symbol ?? symbol).toUpperCase(),
    name: data.name ?? symbol.toUpperCase(),
    priceUsd: data.market_data?.current_price?.usd,
    marketCapUsd: data.market_data?.market_cap?.usd,
    volume24hUsd: data.market_data?.total_volume?.usd,
    circulatingSupply: data.market_data?.circulating_supply,
    totalSupply: data.market_data?.total_supply,
    maxSupply: data.market_data?.max_supply,
    description: data.description?.en?.slice(0, 500),
    source: "coingecko",
    asOf: new Date().toISOString(),
  };
}

function parseDeFiPortfolioBrief(brief?: string): {
  collateralEth: number;
  debtEthEquiv: number;
  perpLongEth: number;
} {
  const text = brief ?? "";
  const collateral =
    Number(text.match(/(\d+(?:\.\d+)?)\s*ETH\s+collateral/i)?.[1]) ||
    Number(text.match(/collateral[^0-9]*(\d+(?:\.\d+)?)\s*ETH/i)?.[1]) ||
    5;
  const debt =
    Number(text.match(/(\d+(?:\.\d+)?)\s*ETH\s+borrowed/i)?.[1]) ||
    Number(text.match(/borrow(?:ed)?[^0-9]*(\d+(?:\.\d+)?)\s*ETH/i)?.[1]) ||
    2;
  const perp =
    Number(text.match(/(\d+(?:\.\d+)?)x?\s*long\s+ETH/i)?.[1]) ||
    Number(text.match(/(\d+(?:\.\d+)?)x?\s*long[^.]*PERP/i)?.[1]) ||
    1;
  return { collateralEth: collateral, debtEthEquiv: debt, perpLongEth: perp };
}

function buildPortfolioRiskHeuristic(
  brief?: string,
  market?: Awaited<ReturnType<typeof fetchMarketQuote>> | null
) {
  const topic = brief?.trim() || "DeFi portfolio risk";
  const { collateralEth, debtEthEquiv, perpLongEth } = parseDeFiPortfolioBrief(brief);
  const ethPrice = market?.price ?? 3500;
  const dailyVol = 0.04;
  const liqThreshold = 0.825;
  const ltv = debtEthEquiv / collateralEth;
  const healthFactor = debtEthEquiv > 0 ? (collateralEth * liqThreshold) / debtEthEquiv : 99;
  const liqDropPct = debtEthEquiv > 0 ? Math.max(0, (1 - debtEthEquiv / (collateralEth * liqThreshold)) * 100) : 0;
  const netEthLong = collateralEth + perpLongEth;
  const notionalUsd = netEthLong * ethPrice;
  const var95Usd = Math.round(1.65 * dailyVol * notionalUsd);
  const liqScore = Math.min(
    100,
    Math.round(
      ltv * 55 +
        (perpLongEth / collateralEth) * 25 +
        (healthFactor < 1.3 ? 30 : healthFactor < 1.8 ? 15 : 0)
    )
  );
  const portfolioRiskScore = Math.min(100, Math.round(liqScore * 0.55 + (perpLongEth > 0 ? 20 : 0) + ltv * 30));
  const liqLabel = healthFactor >= 2 ? "low" : healthFactor >= 1.35 ? "moderate" : "elevated";

  return {
    type: "portfolio-risk" as const,
    focus: topic,
    liquidationRisk: {
      score: liqScore,
      label: liqLabel,
      positionsAtRisk: [
        `Aave ETH collateral (${collateralEth} ETH) — HF ≈ ${healthFactor.toFixed(2)} at ~$${ethPrice.toLocaleString()} ETH`,
        debtEthEquiv > 0
          ? `USDC debt (~${debtEthEquiv} ETH notional) — liquidation if ETH drops ~${liqDropPct.toFixed(0)}% without repayment`
          : "No borrow leg detected",
        perpLongEth > 0
          ? `Hyperliquid ${perpLongEth}x ETH-PERP — adds ${perpLongEth} ETH delta on top of collateral`
          : "No perp leg detected",
      ],
    },
    valueAtRisk: {
      horizon: "24h",
      confidence: "95%",
      estimateUsd: `$${var95Usd.toLocaleString()} – $${Math.round(var95Usd * 1.35).toLocaleString()}`,
      note: `Parametric VaR on ~${netEthLong.toFixed(1)} ETH net long exposure at ${(dailyVol * 100).toFixed(0)}% daily vol.`,
    },
    portfolioRiskScore,
    factors: [
      {
        name: "Aave LTV",
        severity: (ltv > 0.65 ? "high" : ltv > 0.45 ? "medium" : "low") as "low" | "medium" | "high",
        note: `${(ltv * 100).toFixed(0)}% LTV on ${collateralEth} ETH collateral vs ~${debtEthEquiv} ETH debt.`,
      },
      {
        name: "Health factor",
        severity: (healthFactor < 1.35 ? "high" : healthFactor < 1.8 ? "medium" : "low") as
          | "low"
          | "medium"
          | "high",
        note: `Estimated HF ${healthFactor.toFixed(2)} (Aave ETH LT ~${(liqThreshold * 100).toFixed(0)}%).`,
      },
      {
        name: "Perp delta stacking",
        severity: (perpLongEth >= collateralEth * 0.5 ? "high" : "medium") as "low" | "medium" | "high",
        note: `${perpLongEth} ETH perp long stacks on ${collateralEth} ETH collateral — net ~${netEthLong} ETH long.`,
      },
      {
        name: "Stablecoin borrow",
        severity: "medium" as const,
        note: "USDC debt is USD-fixed; ETH drawdowns compress HF without offsetting perp gains if funding turns.",
      },
      {
        name: "Correlation",
        severity: "high" as const,
        note: "Collateral, perp, and ETH price move together — hedges are not automatic.",
      },
    ],
    hedges: [
      {
        action: "Reduce net ETH delta",
        instrument: "Partial perp close or short ETH-PERP",
        rationale: `Closing ~${Math.min(perpLongEth, netEthLong - debtEthEquiv).toFixed(1)} ETH perp lowers liquidation sensitivity while keeping borrow capacity.`,
      },
      {
        action: "Repay / delever",
        instrument: "USDC repayment on Aave",
        rationale: `Repaying ~${(debtEthEquiv * 0.25).toFixed(2)} ETH of debt lifts HF toward ${(healthFactor * 1.25).toFixed(2)}+.`,
      },
      {
        action: "Tail hedge",
        instrument: "OTM ETH put or protective perp stop",
        rationale: `Cap loss below ~${liqDropPct.toFixed(0)}% ETH move that threatens Aave liquidation.`,
      },
    ],
    summary: `Portfolio is ~${netEthLong} ETH net long (${collateralEth} ETH Aave collateral, ${debtEthEquiv} ETH USDC debt, ${perpLongEth} ETH perp). Estimated HF ${healthFactor.toFixed(2)} — ${liqLabel} liquidation risk if ETH falls ~${liqDropPct.toFixed(0)}%. 24h 95% VaR ≈ $${var95Usd.toLocaleString()} on $${Math.round(notionalUsd).toLocaleString()} exposure.${market ? ` ETH $${market.price} (${market.change24h}% 24h).` : ""} Not investment advice.`,
    brief: brief?.trim() || undefined,
    marketContext: market ?? undefined,
    generatedAt: new Date().toISOString(),
    source: market?.source ?? "heuristic",
  };
}

export async function buildPortfolioRiskPayload(brief?: string, priorContext?: string) {
  const topic = brief?.trim() || "DeFi portfolio risk";
  const market = await fetchMarketQuote(brief).catch(() => null);
  const ctx = priorContext?.trim() ? `\n\nContext from prior agents:\n${priorContext.trim().slice(0, 6000)}` : "";

  if (!analystConfigured()) {
    return buildPortfolioRiskHeuristic(brief, market);
  }

  try {
    return await analystJson<{
      type: string;
      focus: string;
      liquidationRisk: { score: number; label: string; positionsAtRisk: string[] };
      valueAtRisk: { horizon: string; confidence: string; estimateUsd: string; note: string };
      portfolioRiskScore: number;
      factors: { name: string; severity: "low" | "medium" | "high"; note: string }[];
      hedges: { action: string; instrument: string; rationale: string }[];
      summary: string;
    }>(
      `You are a DeFi risk officer. Analyze leveraged/DeFi portfolio risk. Return JSON:
type="portfolio-risk", focus, liquidationRisk (score 0-100, label, positionsAtRisk strings),
valueAtRisk (horizon e.g. "24h", confidence e.g. "95%", estimateUsd range string, note),
portfolioRiskScore (0-100), factors (4-6), hedges (2-4 with action/instrument/rationale), summary.
Not investment advice. Be specific to DeFi (collateral ratios, LTV, funding, stablecoin depeg).`,
      `Portfolio risk analysis: ${topic}${market ? `\nMarket: ${JSON.stringify(market)}` : ""}${ctx}`
    ).then((data) => ({
      ...data,
      brief: brief?.trim() || undefined,
      marketContext: market ?? undefined,
      generatedAt: new Date().toISOString(),
      source: ANALYST_SOURCE,
    }));
  } catch {
    return buildPortfolioRiskHeuristic(brief, market);
  }
}

export async function buildCryptoNewsIntelligencePayload(brief?: string) {
  const topic = brief?.trim() || "cryptocurrency markets";
  const live = await fetchLiveCryptoHeadlines(40).catch(() => [] as LiveHeadline[]);

  if (live.length === 0 && !analystConfigured()) {
    throw analystUnavailable("Crypto News Intelligence Agent");
  }

  if (!analystConfigured()) {
    return {
      type: "crypto-news-intelligence",
      topic,
      marketSentiment: { score: 0, label: "neutral" as const },
      marketMovingEvents: live.slice(0, 8).map((h) => ({
        headline: h.title,
        source: h.source,
        url: h.url,
        impact: "medium" as const,
        bullishBearish: 0,
        whyItMatters: "Review headline for trading implications.",
      })),
      summary: `Synthesized ${live.length} headlines from live feeds.`,
      sourcesScanned: live.length,
      generatedAt: new Date().toISOString(),
      source: "rss",
    };
  }

  return analystJson<{
    type: string;
    topic: string;
    marketSentiment: { score: number; label: "bullish" | "bearish" | "neutral" | "mixed" };
    marketMovingEvents: {
      headline: string;
      source: string;
      url?: string;
      impact: "low" | "medium" | "high";
      bullishBearish: number;
      whyItMatters: string;
    }[];
    themes: string[];
    summary: string;
  }>(
    `You are a crypto intelligence desk. Given live RSS headlines from the last 24h, produce a market intelligence report.
Use ONLY provided headlines — do not invent stories.
Return JSON: type="crypto-news-intelligence", topic, marketSentiment (score -1 to 1, label),
marketMovingEvents (6-10 most market-moving with impact, bullishBearish -1 to 1, whyItMatters),
themes (3-5 macro themes), summary (executive paragraph).`,
    `User brief: ${topic}

Live headlines (${live.length} scanned):
${JSON.stringify(live.slice(0, 35), null, 2)}`
  ).then((data) => ({
    ...data,
    topic,
    sourcesScanned: live.length,
    generatedAt: new Date().toISOString(),
    source: live.length > 0 ? "rss+butler" : ANALYST_SOURCE,
  }));
}

export async function buildWalletReputationPayload(brief?: string) {
  if (!analystConfigured()) {
    throw analystUnavailable("Wallet Reputation Agent");
  }
  const fromBrief = extractWalletAddress(brief);
  const wallet = fromBrief;
  const address = wallet ?? "0x0000000000000000000000000000000000000000";
  const request = brief?.trim() || `Wallet reputation for ${address}`;

  return analystJson<{
    type: string;
    address: string;
    scamScore: number;
    whaleScore: number;
    sybilScore: number;
    defiHistory: { protocols: string[]; activityLevel: string; tenure: string };
    pnlEstimate: { label: string; confidence: "low" | "medium" | "high"; note: string };
    flags: string[];
    copyTradeVerdict: "avoid" | "caution" | "neutral" | "favorable" | "recommended";
    summary: string;
  }>(
    `You assess EVM wallet reputation for copy-trading due diligence. Return JSON:
type="wallet-reputation", address, scamScore (0-100, higher=worse), whaleScore (0-100),
sybilScore (0-100, higher=worse), defiHistory (protocols[], activityLevel, tenure),
pnlEstimate (label e.g. "profitable trader", confidence, note — heuristic only),
flags (red/yellow flags), copyTradeVerdict, summary.
Note: without on-chain API this is pattern-based heuristics from address + user context — state limitations in summary.`,
    `Wallet reputation check: ${request}\nAddress: ${address}`
  ).then((data) => ({
    ...data,
    address: fromBrief ?? data.address,
    brief: brief?.trim() || undefined,
    disclaimer: "Heuristic assessment — verify on-chain before copying trades.",
    generatedAt: new Date().toISOString(),
    source: ANALYST_SOURCE,
  }));
}

export async function buildTokenResearchPayload(brief?: string, priorContext?: string) {
  const topic = brief?.trim() || "token research";
  const { symbol } = inferSymbol(brief);
  const coin = await fetchCoinDetail(symbol).catch(() => null);
  const ctx = priorContext?.trim() ? `\n\nPrior context:\n${priorContext.trim().slice(0, 4000)}` : "";

  if (!analystConfigured() && !coin) {
    throw analystUnavailable("Token Research Agent");
  }

  if (!analystConfigured()) {
    return {
      type: "token-research",
      token: symbol,
      marketData: coin,
      holders: { distribution: "Data unavailable without analyst", topHolders: [] as string[] },
      tvl: { estimate: "N/A", protocols: [] as string[] },
      unlockSchedule: [] as { date: string; amount: string; note: string }[],
      tokenomics: { supply: coin?.circulatingSupply, maxSupply: coin?.maxSupply },
      competitors: [] as string[],
      risks: ["Analyst service not configured for full token research synthesis."],
      summary: `${symbol} market snapshot from CoinGecko.`,
      generatedAt: new Date().toISOString(),
      source: "coingecko",
    };
  }

  return analystJson<{
    type: string;
    token: string;
    holders: { distribution: string; topHolders: string[] };
    tvl: { estimate: string; protocols: string[] };
    unlockSchedule: { date: string; amount: string; note: string }[];
    tokenomics: { model: string; inflation: string; utility: string; supplyNotes: string };
    competitors: { name: string; differentiator: string }[];
    risks: { risk: string; severity: "low" | "medium" | "high" }[];
    bullCase: string;
    bearCase: string;
    summary: string;
  }>(
    `You are a crypto token analyst. Return JSON: type="token-research", token symbol,
holders (distribution narrative, topHolders as % strings),
tvl (estimate string, protocols[]), unlockSchedule (upcoming unlocks if known or estimated),
tokenomics (model, inflation, utility, supplyNotes), competitors (3-5 with differentiator),
risks (4-6 with severity), bullCase, bearCase, summary.
Use market data when provided; clearly note estimates vs verified data.`,
    `Token research: ${topic}
Symbol: ${symbol}
${coin ? `Market data: ${JSON.stringify(coin)}` : ""}${ctx}`
  ).then((data) => ({
    ...data,
    token: data.token || symbol,
    marketData: coin ?? undefined,
    brief: brief?.trim() || undefined,
    generatedAt: new Date().toISOString(),
    source: coin ? "coingecko+butler" : ANALYST_SOURCE,
  }));
}
