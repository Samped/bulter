/** Live flight/hotel lookup via OpenAI Responses + web_search (falls back to caller demo). */

import type { TravelTrip } from "./travel-agents.ts";

export type LiveFlight = {
  id: string;
  carrier: string;
  flightNumber: string;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  durationHours: number;
  stops: number;
  cabin: string;
  priceUsd: number;
  seatsLeft?: number;
  refundable?: boolean;
  note: string;
  bookUrl: string;
};

export type LiveHotel = {
  id: string;
  name: string;
  stars: number;
  neighborhood: string;
  address?: string;
  nightlyUsd: number;
  score?: number;
  amenities: string[];
  checkIn: string;
  checkOut: string;
  nights: number;
  totalUsd: number;
  rooms: number;
  bookUrl: string;
};

export type LiveTravelBundle = {
  flights: LiveFlight[];
  hotels: LiveHotel[];
  sources: string[];
  mode: "live-web";
  provider: "openai-web-search";
};

export type LiveItineraryDay = {
  date: string;
  title: string;
  items: string[];
};

function apiKey(): string | undefined {
  return process.env.OPENAI_API_KEY?.trim() || undefined;
}

function modelName(): string {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
}

function nightsBetween(depart: string, ret: string): number {
  return Math.max(
    1,
    Math.round((new Date(ret).getTime() - new Date(depart).getTime()) / 86_400_000),
  );
}

export function googleFlightsUrl(trip: TravelTrip): string {
  const q = encodeURIComponent(
    `Flights to ${trip.destinationCode} from ${trip.originCode} on ${trip.departDate} through ${trip.returnDate}`,
  );
  return `https://www.google.com/travel/flights?q=${q}&curr=USD`;
}

export function bookingSearchUrl(trip: TravelTrip): string {
  const params = new URLSearchParams({
    ss: trip.destination,
    checkin: trip.departDate,
    checkout: trip.returnDate,
    group_adults: String(trip.travelers),
    no_rooms: String(Math.ceil(trip.travelers / 2)),
    selected_currency: "USD",
  });
  return `https://www.booking.com/searchresults.html?${params.toString()}`;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function outputText(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  const output = payload.output;
  if (!Array.isArray(output)) return typeof payload.output_text === "string" ? payload.output_text : "";
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (row.type === "message" && Array.isArray(row.content)) {
      for (const c of row.content) {
        if (!c || typeof c !== "object") continue;
        const chunk = c as Record<string, unknown>;
        if (typeof chunk.text === "string") parts.push(chunk.text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function openAiWebJson(prompt: string, timeoutMs = 55_000): Promise<Record<string, unknown> | null> {
  const key = apiKey();
  if (!key) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelName(),
        tools: [{ type: "web_search_preview" }],
        input: prompt,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`[travel-live] OpenAI ${res.status}: ${errText.slice(0, 200)}`);
      return null;
    }
    const body = (await res.json()) as Record<string, unknown>;
    return extractJsonObject(outputText(body));
  } catch (e) {
    console.warn("[travel-live] web search failed:", e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function airportCode(v: unknown, fallback: string): string {
  const s = str(v, fallback);
  const paren = s.match(/\(([A-Z]{3})\)/i);
  if (paren?.[1]) return paren[1].toUpperCase();
  const bare = s.match(/\b([A-Z]{3})\b/);
  if (bare?.[1]) return bare[1].toUpperCase();
  return fallback;
}

function normalizeFlights(raw: unknown[], trip: TravelTrip, bookFallback: string): LiveFlight[] {
  return raw.slice(0, 6).map((row, i) => {
    const f = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const stops = Math.max(0, Math.round(num(f.stops, 0)));
    const priceUsd = Math.max(1, Math.round(num(f.priceUsd, 0)));
    const bookUrlRaw = str(f.bookUrl, bookFallback);
    const bookUrl =
      /google\.com\/travel\/flights|kayak\.com|expedia\.com|qatarairways\.com|aa\.com|united\.com|delta\.com/i.test(
        bookUrlRaw,
      )
        ? bookUrlRaw
        : bookFallback;
    return {
      id: str(f.id, `live-flt-${trip.originCode}-${trip.destinationCode}-${i + 1}`),
      carrier: str(f.carrier, "Airline"),
      flightNumber: str(f.flightNumber, ""),
      from: trip.originCode,
      to: trip.destinationCode,
      departAt: str(f.departAt, `${trip.departDate}T12:00:00`),
      arriveAt: str(f.arriveAt, `${trip.departDate}T23:00:00`),
      durationHours: Number(num(f.durationHours, 12).toFixed(2)),
      stops,
      cabin: str(f.cabin, trip.cabin),
      priceUsd,
      note: str(f.note, stops === 0 ? "Nonstop" : `${stops} stop${stops > 1 ? "s" : ""}`),
      bookUrl,
    };
  });
}

function normalizeHotels(raw: unknown[], trip: TravelTrip, nights: number, bookFallback: string): LiveHotel[] {
  const rooms = Math.ceil(trip.travelers / 2);
  return raw.slice(0, 6).map((row, i) => {
    const h = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const nightlyUsd = Math.max(1, Math.round(num(h.nightlyUsd, num(h.totalUsd, 0) / nights || 0)));
    const totalUsd = Math.max(1, Math.round(num(h.totalUsd, nightlyUsd * nights)));
    const bookUrlRaw = str(h.bookUrl, bookFallback);
    const bookUrl =
      /booking\.com|hotels\.com|expedia\.com|hilton\.com|marriott\.com|hyatt\.com|ihg\.com|google\.com\/travel/i.test(
        bookUrlRaw,
      )
        ? bookUrlRaw
        : bookFallback;
    return {
      id: str(h.id, `live-htl-${trip.destinationCode}-${i + 1}`),
      name: str(h.name, `${trip.destination} Hotel`),
      stars: Math.min(5, Math.max(1, Math.round(num(h.stars, 4)))),
      neighborhood: str(h.neighborhood, trip.destination),
      address: str(h.address) || undefined,
      nightlyUsd,
      score: num(h.score, 0) || undefined,
      amenities: Array.isArray(h.amenities) ? h.amenities.map((a) => String(a)).slice(0, 8) : ["Wi‑Fi"],
      checkIn: trip.departDate,
      checkOut: trip.returnDate,
      nights,
      totalUsd,
      rooms,
      bookUrl,
    };
  });
}

/** Search live flights + hotels for a trip. Returns null if unavailable. */
export async function searchLiveTravel(trip: TravelTrip): Promise<LiveTravelBundle | null> {
  if (!apiKey()) return null;
  if (process.env.BUTLER_TRAVEL_LIVE === "false") return null;

  const nights = nightsBetween(trip.departDate, trip.returnDate);
  const flightsUrl = googleFlightsUrl(trip);
  const hotelsUrl = bookingSearchUrl(trip);

  const prompt = `You are a travel shopping assistant. Use web search to find CURRENT real flight and hotel options.

Trip:
- Origin: ${trip.origin} (${trip.originCode})
- Destination: ${trip.destination} (${trip.destinationCode})
- Depart: ${trip.departDate}
- Return: ${trip.returnDate}
- Travelers: ${trip.travelers}
- Cabin: ${trip.cabin}
- Nights: ${nights}

Requirements:
1) Find 3–5 real outbound+return (or priced round-trip) flight options for EXACTLY ${trip.originCode} → ${trip.destinationCode} (not any other city pair). Reject results that depart/arrive elsewhere.
2) Prefer real flight numbers when published (e.g. QR701). Include duration hours and stops.
3) Find 3–5 real hotels in/near ${trip.destination} (${trip.destinationCode}) ONLY — not in ${trip.origin}. Include real names, star rating, neighborhood/area, address if available, and realistic nightly USD rates for these dates from Booking.com, Hotels.com, Google Hotels, or official sites.
4) Do NOT invent fake airlines like "Testnet Air" or placeholder hotels like "Gateway Inn".
5) Every flight.from must be ${trip.originCode} and flight.to must be ${trip.destinationCode} (or the destination airport city).
6) Prefer bookUrl values that deep-link to Google Flights or Booking.com for this trip. Fallback URLs:
   - flights: ${flightsUrl}
   - hotels: ${hotelsUrl}

Return ONLY valid JSON (no markdown) with this shape:
{
  "flights":[{"carrier":"","flightNumber":"","from":"${trip.originCode}","to":"${trip.destinationCode}","departAt":"ISO","arriveAt":"ISO","durationHours":0,"stops":0,"cabin":"${trip.cabin}","priceUsd":0,"note":"","bookUrl":""}],
  "hotels":[{"name":"","stars":0,"neighborhood":"","address":"","nightlyUsd":0,"totalUsd":0,"amenities":[""],"bookUrl":""}],
  "sources":["https://..."]
}`;

  const parsed = await openAiWebJson(prompt);
  if (!parsed) return null;

  let flights = normalizeFlights(
    (Array.isArray(parsed.flights) ? parsed.flights : []).filter((row) => {
      if (!row || typeof row !== "object") return false;
      const f = row as Record<string, unknown>;
      const from = airportCode(f.from, "");
      const to = airportCode(f.to, "");
      if (from && from !== trip.originCode) return false;
      if (to && to !== trip.destinationCode) return false;
      return true;
    }),
    trip,
    flightsUrl,
  );
  let hotels = normalizeHotels(
    (Array.isArray(parsed.hotels) ? parsed.hotels : []).filter((row) => {
      if (!row || typeof row !== "object") return false;
      const h = row as Record<string, unknown>;
      const blob = `${h.name ?? ""} ${h.neighborhood ?? ""} ${h.address ?? ""}`.toLowerCase();
      const destOk = destHint(trip).some((tok) => blob.includes(tok));
      const originOnly =
        trip.origin.toLowerCase().length > 2 &&
        blob.includes(trip.origin.toLowerCase()) &&
        !destOk;
      // Reject lodging clearly in the wrong city/country (e.g. London when trip is Nairobi).
      const wrongCity = ["london", "heathrow", "paris", "new york", "los angeles", "dubai"].some(
        (c) => blob.includes(c) && !destHint(trip).includes(c) && c !== trip.destination.toLowerCase(),
      );
      return destOk && !originOnly && !wrongCity;
    }),
    trip,
    nights,
    hotelsUrl,
  );

  if (flights.length === 0 && hotels.length === 0) return null;

  // Always pin hotel book links to the destination search for these dates.
  hotels = hotels.map((h) => ({
    ...h,
    bookUrl: hotelsUrl,
    checkIn: trip.departDate,
    checkOut: trip.returnDate,
    neighborhood: h.neighborhood || trip.destination,
  }));

  const sources = Array.isArray(parsed.sources)
    ? parsed.sources.map((s) => String(s)).filter(Boolean).slice(0, 12)
    : [];
  if (!sources.includes(flightsUrl)) sources.unshift(flightsUrl);
  if (!sources.includes(hotelsUrl)) sources.push(hotelsUrl);

  flights.sort((a, b) => a.priceUsd - b.priceUsd);
  hotels.sort((a, b) => a.totalUsd - b.totalUsd);

  return {
    flights,
    hotels,
    sources,
    mode: "live-web",
    provider: "openai-web-search",
  };
}

function destHint(trip: TravelTrip): string[] {
  return [trip.destination, trip.destinationCode]
    .join(" ")
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 2);
}

/** Build a destination-aware day plan from live web context. */
export async function searchLiveItineraryDays(
  trip: TravelTrip,
  opts: {
    flight?: { carrier?: string; flightNumber?: string; from?: string; to?: string } | null;
    hotel?: { name?: string; neighborhood?: string } | null;
  },
): Promise<LiveItineraryDay[] | null> {
  if (!apiKey()) return null;
  if (process.env.BUTLER_TRAVEL_LIVE === "false") return null;

  const nights = nightsBetween(trip.departDate, trip.returnDate);
  const dayCount = Math.min(nights + 1, 5);
  const prompt = `Plan a realistic ${dayCount}-day visitor itinerary for ${trip.destination} (${trip.destinationCode}).
Dates: ${trip.departDate} to ${trip.returnDate}.
Arrival flight hint: ${opts.flight ? `${opts.flight.carrier ?? ""} ${opts.flight.flightNumber ?? ""} (${opts.flight.from}→${opts.flight.to})` : "unknown"}.
Hotel hint: ${opts.hotel ? `${opts.hotel.name} (${opts.hotel.neighborhood ?? ""})` : "unknown"}.

Use web search for real attractions, neighborhoods, and practical tips in ${trip.destination}.
Return ONLY JSON:
{"days":[{"date":"YYYY-MM-DD","title":"","items":["specific place or activity", "..."]}]}
Day 1 should include arrival/check-in. Last day should include checkout/departure buffer.
Each day needs 3–5 concrete items (named places, not generic filler).`;

  const parsed = await openAiWebJson(prompt, 45_000);
  if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;

  return parsed.days.slice(0, dayCount).map((row, i) => {
    const d = (row && typeof row === "object" ? row : {}) as Record<string, unknown>;
    const base = new Date(`${trip.departDate}T12:00:00Z`);
    base.setUTCDate(base.getUTCDate() + i);
    const date = str(d.date, base.toISOString().slice(0, 10));
    const items = Array.isArray(d.items) ? d.items.map((x) => String(x)).filter(Boolean).slice(0, 6) : [];
    return {
      date,
      title: str(d.title, i === 0 ? `Arrive ${trip.destination}` : `Explore ${trip.destination}`),
      items: items.length > 0 ? items : [`Explore ${trip.destination}`],
    };
  });
}

export function liveTravelEnabled(): boolean {
  return !!apiKey() && process.env.BUTLER_TRAVEL_LIVE !== "false";
}
