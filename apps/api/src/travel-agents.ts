/** Travel search + itinerary payloads — live web when OPENAI_API_KEY is set, else demo quotes. */

import {
  bookingSearchUrl,
  googleFlightsUrl,
  liveTravelEnabled,
  searchLiveItineraryDays,
  searchLiveTravel,
  type LiveTravelBundle,
} from "./travel-live.ts";

export type TravelTrip = {
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  departDate: string;
  returnDate: string;
  travelers: number;
  cabin: "economy" | "premium" | "business";
};

const liveCache = new Map<string, Promise<LiveTravelBundle | null>>();

function tripCacheKey(trip: TravelTrip): string {
  return [trip.originCode, trip.destinationCode, trip.departDate, trip.returnDate, trip.travelers, trip.cabin].join("|");
}

async function liveBundleFor(trip: TravelTrip): Promise<LiveTravelBundle | null> {
  if (!liveTravelEnabled()) return null;
  const key = tripCacheKey(trip);
  let pending = liveCache.get(key);
  if (!pending) {
    pending = searchLiveTravel(trip).finally(() => {
      // Keep warm briefly so flight + hotel agents in the same ETF share one lookup.
      setTimeout(() => liveCache.delete(key), 120_000);
    });
    liveCache.set(key, pending);
  }
  return pending;
}

const CITY_CODES: Record<string, { name: string; code: string }> = {
  nyc: { name: "New York", code: "JFK" },
  "new york": { name: "New York", code: "JFK" },
  london: { name: "London", code: "LHR" },
  paris: { name: "Paris", code: "CDG" },
  tokyo: { name: "Tokyo", code: "NRT" },
  lagos: { name: "Lagos", code: "LOS" },
  kenya: { name: "Nairobi", code: "NBO" },
  nairobi: { name: "Nairobi", code: "NBO" },
  mombasa: { name: "Mombasa", code: "MBA" },
  dubai: { name: "Dubai", code: "DXB" },
  singapore: { name: "Singapore", code: "SIN" },
  "san francisco": { name: "San Francisco", code: "SFO" },
  sf: { name: "San Francisco", code: "SFO" },
  la: { name: "Los Angeles", code: "LAX" },
  "los angeles": { name: "Los Angeles", code: "LAX" },
  miami: { name: "Miami", code: "MIA" },
  chicago: { name: "Chicago", code: "ORD" },
  berlin: { name: "Berlin", code: "BER" },
  rome: { name: "Rome", code: "FCO" },
  madrid: { name: "Madrid", code: "MAD" },
  amsterdam: { name: "Amsterdam", code: "AMS" },
  sydney: { name: "Sydney", code: "SYD" },
  toronto: { name: "Toronto", code: "YYZ" },
  mumbai: { name: "Mumbai", code: "BOM" },
  qatar: { name: "Doha", code: "DOH" },
  doha: { name: "Doha", code: "DOH" },
  "abu dhabi": { name: "Abu Dhabi", code: "AUH" },
  riyadh: { name: "Riyadh", code: "RUH" },
  cairo: { name: "Cairo", code: "CAI" },
  istanbul: { name: "Istanbul", code: "IST" },
  bahrain: { name: "Manama", code: "BAH" },
  manama: { name: "Manama", code: "BAH" },
  kuwait: { name: "Kuwait City", code: "KWI" },
  "hong kong": { name: "Hong Kong", code: "HKG" },
  nigeria: { name: "Lagos", code: "LOS" },
  ghana: { name: "Accra", code: "ACC" },
  accra: { name: "Accra", code: "ACC" },
  "south africa": { name: "Johannesburg", code: "JNB" },
  johannesburg: { name: "Johannesburg", code: "JNB" },
  "cape town": { name: "Cape Town", code: "CPT" },
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Match city keys on word boundaries so "la" does not hit inside "lagos". */
function cityKeyIndex(text: string, key: string, from = 0): number {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|[^a-z])(${escaped})(?![a-z])`, "gi");
  re.lastIndex = from;
  const m = re.exec(text);
  if (!m || m.index == null) return -1;
  const full = m[0];
  const matched = m[1] ?? key;
  return m.index + (full.length - matched.length);
}

function findCity(text: string, opts?: { excludeCodes?: string[] }): { name: string; code: string } | null {
  const t = text.toLowerCase();
  const exclude = new Set((opts?.excludeCodes ?? []).map((c) => c.toUpperCase()));
  const keys = Object.keys(CITY_CODES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (cityKeyIndex(t, key) < 0) continue;
    const city = CITY_CODES[key]!;
    if (exclude.has(city.code)) continue;
    return city;
  }
  return null;
}

function findAllCities(text: string): { name: string; code: string; index: number }[] {
  const t = text.toLowerCase();
  const keys = Object.keys(CITY_CODES).sort((a, b) => b.length - a.length);
  const hits: { name: string; code: string; index: number; keyLen: number }[] = [];
  const usedRanges: [number, number][] = [];
  for (const key of keys) {
    let from = 0;
    while (from < t.length) {
      const idx = cityKeyIndex(t, key, from);
      if (idx < 0) break;
      const end = idx + key.length;
      const overlaps = usedRanges.some(([a, b]) => idx < b && end > a);
      if (!overlaps) {
        const city = CITY_CODES[key]!;
        hits.push({ name: city.name, code: city.code, index: idx, keyLen: key.length });
        usedRanges.push([idx, end]);
      }
      from = idx + key.length;
    }
  }
  hits.sort((a, b) => a.index - b.index || b.keyLen - a.keyLen);
  const seen = new Set<string>();
  const unique: { name: string; code: string; index: number }[] = [];
  for (const h of hits) {
    if (seen.has(h.code)) continue;
    seen.add(h.code);
    unique.push({ name: h.name, code: h.code, index: h.index });
  }
  return unique;
}

/** Parse a free-text travel brief with local rules (fallback when LLM parse is unavailable). */
export function parseTravelTripLocal(brief?: string): TravelTrip {
  const t = (brief ?? "").toLowerCase();

  // Strongest: "from Lagos to Qatar" / "Lagos to Doha"
  const fromTo =
    t.match(
      /\b(?:from|depart(?:ing)?\s+from)\s+([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s+(?:next|in|on|for|with|and|give|me|hotels?|flights?|march|april|may|june|july|august|september|october|november|december|\d)|$|,|\.|!)/i,
    ) ||
    t.match(
      /\b(?!want|need|like|have|going|able|try|trying|used|ought|supposed)([a-z][a-z\s]{1,40}?)\s+to\s+([a-z\s]+?)(?:\s+(?:next|in|on|for|with|and|give|me|hotels?|flights?|from|march|april|may|june|july|august|september|october|november|december|\d)|$|,|\.|!)/i,
    );

  let origin = fromTo ? findCity(fromTo[1] ?? "") : null;
  let destination = fromTo ? findCity(fromTo[2] ?? "") : null;

  // "travel to Qatar from Lagos" / "flights to Doha from LOS"
  if (!destination || !origin) {
    const toFrom = t.match(
      /\b(?:travel to|trip to|flights?\s+to|to)\s+([a-z\s]+?)\s+from\s+([a-z\s]+?)(?:\s|$|,|\.|!)/i,
    );
    if (toFrom) {
      destination = destination ?? findCity(toFrom[1] ?? "");
      origin = origin ?? findCity(toFrom[2] ?? "");
    }
  }

  // "travel to Qatar" / "trip to Doha" — avoid matching "want to" / "to travel"
  if (!destination) {
    const toOnly = t.match(
      /\b(?:travel to|trip to|flights?\s+to|fly to|going to|visit(?:ing)?)\s+([a-z\s]+?)(?:\s+(?:from|next|in|on|for|with|and|give|me|hotels?|flights?|march|april|may|june|july|august|september|october|november|december|\d)|$|,|\.|!)/i,
    );
    destination = findCity(toOnly?.[1] ?? "");
  }

  // Fallback: ordered city mentions in the brief (first = origin-ish, last = destination-ish)
  const cities = findAllCities(t);
  // Never treat a lone origin city as the destination ("from Lagos to Kenya" must not become Lagos→Lagos).
  if (!destination && cities.length >= 2) {
    destination = cities[cities.length - 1]!;
  }
  if (!origin && cities.length >= 1) {
    const candidate = cities[0]!;
    if (!destination || candidate.code !== destination.code) origin = candidate;
  }
  if (!origin && cities.length >= 2) {
    origin = cities.find((c) => c.code !== destination?.code) ?? cities[0]!;
  }

  if (!destination) destination = CITY_CODES.paris!;
  if (!origin || origin.code === destination.code) {
    const other = cities.find((c) => c.code !== destination!.code);
    if (other) origin = other;
    else origin = destination.code === "JFK" ? CITY_CODES.london! : CITY_CODES.nyc!;
  }

  // If "from X" is explicit and differs, keep it even when defaults ran first
  const fromOnly = t.match(/\b(?:from|depart(?:ing)?\s+from)\s+([a-z\s]+?)(?:\s+to\b|,|$)/i);
  const fromCity = findCity(fromOnly?.[1] ?? "");
  if (fromCity && fromCity.code !== destination.code) {
    origin = fromCity;
  }

  const today = new Date();
  let depart = addDays(today, /next week/.test(t) ? 7 : /tomorrow/.test(t) ? 1 : 14);
  let ret = addDays(depart, /weekend/.test(t) ? 3 : 7);

  const iso = t.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso?.[1]) {
    depart = new Date(`${iso[1]}T12:00:00Z`);
    ret = addDays(depart, 7);
  }

  const travelers = Number(t.match(/\b(\d+)\s+(?:travelers?|passengers?|people|adults?)\b/)?.[1] ?? 1) || 1;
  const cabin = /business/.test(t) ? "business" : /premium/.test(t) ? "premium" : "economy";

  return {
    origin: origin.name,
    originCode: origin.code,
    destination: destination.name,
    destinationCode: destination.code,
    departDate: isoDate(depart),
    returnDate: isoDate(ret),
    travelers: Math.min(8, Math.max(1, travelers)),
    cabin,
  };
}

/** Sync alias — prefer `resolveTravelTrip` for LLM-backed worldwide parsing. */
export function parseTravelTrip(brief?: string): TravelTrip {
  return parseTravelTripLocal(brief);
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h || 1;
}

const CARRIERS = [
  { name: "Arc Air", code: "AA" },
  { name: "Circle Wings", code: "CW" },
  { name: "Butler Jet", code: "BJ" },
  { name: "Testnet Air", code: "TN" },
];

export async function buildFlightSearchPayload(brief?: string, priorContext?: string) {
  const { resolveTravelTrip } = await import("./travel-parse.ts");
  const trip = await resolveTravelTrip(brief, priorContext);
  const live = await liveBundleFor(trip);
  if (live?.flights?.length) {
    const best = live.flights[0]!;
    return {
      type: "flight-search",
      mode: live.mode,
      provider: live.provider,
      summary: `${live.flights.length} live flight options ${trip.origin} (${trip.originCode}) → ${trip.destination} (${trip.destinationCode}) on ${trip.departDate}. Best fare ~$${best.priceUsd} on ${best.carrier}.`,
      trip,
      currency: "USD",
      flights: live.flights,
      searchUrl: googleFlightsUrl(trip),
      sources: live.sources,
      disclaimer:
        "Live web-sourced fares — prices and seats change quickly. Confirm and book on the airline or OTA link before purchase.",
      generatedAt: new Date().toISOString(),
    };
  }

  const seed = hashSeed(`${trip.originCode}${trip.destinationCode}${trip.departDate}`);
  const flights = [0, 1, 2].map((i) => {
    const carrier = CARRIERS[(seed + i) % CARRIERS.length]!;
    const base = 180 + ((seed >>> (i * 3)) % 420);
    const durationHours = 6 + ((seed + i * 5) % 10);
    const stops = i === 0 ? 0 : i === 1 ? 1 : 0;
    const depHour = 7 + ((seed + i * 2) % 12);
    return {
      id: `flt-${trip.originCode}-${trip.destinationCode}-${i + 1}`,
      carrier: carrier.name,
      flightNumber: `${carrier.code}${100 + ((seed + i) % 800)}`,
      from: trip.originCode,
      to: trip.destinationCode,
      departAt: `${trip.departDate}T${String(depHour).padStart(2, "0")}:25:00Z`,
      arriveAt: `${trip.departDate}T${String((depHour + durationHours) % 24).padStart(2, "0")}:10:00Z`,
      durationHours,
      stops,
      cabin: trip.cabin,
      priceUsd: Number((base + stops * 40 + trip.travelers * 15).toFixed(2)),
      seatsLeft: 2 + ((seed + i) % 7),
      refundable: i === 0,
      note: stops === 0 ? "Nonstop" : "1 stop",
      bookUrl: googleFlightsUrl(trip),
    };
  });

  flights.sort((a, b) => a.priceUsd - b.priceUsd);
  const best = flights[0]!;

  return {
    type: "flight-search",
    mode: "testnet-demo",
    summary: `${flights.length} flight options ${trip.origin} (${trip.originCode}) → ${trip.destination} (${trip.destinationCode}) on ${trip.departDate}. Best fare $${best.priceUsd} on ${best.carrier}.`,
    trip,
    currency: "USD",
    flights,
    searchUrl: googleFlightsUrl(trip),
    disclaimer: "Demo quotes (live search unavailable) — open Google Flights to confirm real fares.",
    generatedAt: new Date().toISOString(),
  };
}

export async function buildHotelSearchPayload(brief?: string, priorContext?: string) {
  const { resolveTravelTrip } = await import("./travel-parse.ts");
  const trip = await resolveTravelTrip(brief, priorContext);
  const nights = Math.max(
    1,
    Math.round((new Date(trip.returnDate).getTime() - new Date(trip.departDate).getTime()) / 86_400_000),
  );
  const live = await liveBundleFor(trip);
  if (live?.hotels?.length) {
    const best = live.hotels[0]!;
    return {
      type: "hotel-search",
      mode: live.mode,
      provider: live.provider,
      summary: `${live.hotels.length} live stays in ${trip.destination} for ${nights} night(s). Best total ~$${best.totalUsd} at ${best.name}.`,
      trip,
      currency: "USD",
      hotels: live.hotels,
      searchUrl: bookingSearchUrl(trip),
      sources: live.sources,
      disclaimer:
        "Live web-sourced hotel rates — availability changes. Confirm total and cancellation terms on the booking link.",
      generatedAt: new Date().toISOString(),
    };
  }

  const seed = hashSeed(`${trip.destinationCode}${trip.departDate}hotel`);

  const hotels = [
    {
      id: `htl-${trip.destinationCode}-1`,
      name: `${trip.destination} Gateway Inn`,
      stars: 3,
      neighborhood: "City center",
      nightlyUsd: 95 + (seed % 40),
      score: 8.2,
      amenities: ["Wi‑Fi", "Breakfast", "Transit nearby"],
    },
    {
      id: `htl-${trip.destinationCode}-2`,
      name: `Arc ${trip.destination} Suites`,
      stars: 4,
      neighborhood: "Business district",
      nightlyUsd: 145 + (seed % 55),
      score: 8.9,
      amenities: ["Wi‑Fi", "Gym", "Late checkout"],
    },
    {
      id: `htl-${trip.destinationCode}-3`,
      name: `${trip.destination} Harbor Loft`,
      stars: 4,
      neighborhood: "Waterfront",
      nightlyUsd: 175 + (seed % 70),
      score: 9.1,
      amenities: ["Wi‑Fi", "River view", "Workspace"],
    },
  ].map((h) => ({
    ...h,
    checkIn: trip.departDate,
    checkOut: trip.returnDate,
    nights,
    totalUsd: Number((h.nightlyUsd * nights).toFixed(2)),
    rooms: Math.ceil(trip.travelers / 2),
    bookUrl: bookingSearchUrl(trip),
  }));

  hotels.sort((a, b) => a.totalUsd - b.totalUsd);
  const best = hotels[0]!;

  return {
    type: "hotel-search",
    mode: "testnet-demo",
    summary: `${hotels.length} stays in ${trip.destination} for ${nights} night(s). Best total $${best.totalUsd} at ${best.name}.`,
    trip,
    currency: "USD",
    hotels,
    searchUrl: bookingSearchUrl(trip),
    disclaimer: "Demo hotel quotes (live search unavailable) — open Booking.com to confirm real rates.",
    generatedAt: new Date().toISOString(),
  };
}

function extractJsonBlocks(context: string): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [];
  const re = /\{[\s\S]*?\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(context))) {
    try {
      const parsed = JSON.parse(m[0]) as unknown;
      if (parsed && typeof parsed === "object") blocks.push(parsed as Record<string, unknown>);
    } catch {
      /* ignore partial */
    }
  }
  return blocks;
}

export async function buildItineraryPayload(brief?: string, priorContext?: string) {
  const context = priorContext ?? "";
  const { resolveTravelTrip } = await import("./travel-parse.ts");
  const trip = await resolveTravelTrip(brief, context);
  const blocks = extractJsonBlocks(context);
  const flightBlock = blocks.find((b) => b.type === "flight-search") as
    | { flights?: { carrier?: string; flightNumber?: string; priceUsd?: number; from?: string; to?: string }[] }
    | undefined;
  const hotelBlock = blocks.find((b) => b.type === "hotel-search") as
    | { hotels?: { name?: string; totalUsd?: number; neighborhood?: string }[] }
    | undefined;

  const flight = flightBlock?.flights?.[0];
  const hotel = hotelBlock?.hotels?.[0];
  const nights = Math.max(
    1,
    Math.round((new Date(trip.returnDate).getTime() - new Date(trip.departDate).getTime()) / 86_400_000),
  );

  const liveDays = await searchLiveItineraryDays(trip, { flight, hotel });
  const days =
    liveDays ??
    Array.from({ length: Math.min(nights + 1, 5) }, (_, i) => {
      const day = addDays(new Date(`${trip.departDate}T12:00:00Z`), i);
      const date = isoDate(day);
      if (i === 0) {
        return {
          date,
          title: `Arrive ${trip.destination}`,
          items: [
            flight
              ? `Land via ${flight.carrier ?? "carrier"} ${flight.flightNumber ?? ""} (${flight.from}→${flight.to})`
              : `Arrive ${trip.destinationCode}`,
            hotel ? `Check in — ${hotel.name} (${hotel.neighborhood ?? "city"})` : "Check in to lodging",
            "Light walk + dinner near hotel",
          ],
        };
      }
      if (i === nights || i === Math.min(nights, 4)) {
        return {
          date,
          title: "Depart",
          items: [
            hotel ? `Checkout — ${hotel.name}` : "Checkout",
            flight ? `Return flight (~$${flight.priceUsd ?? "—"})` : "Return flight",
            "Buffer 2h before departure",
          ],
        };
      }
      return {
        date,
        title: `Explore ${trip.destination}`,
        items: [
          "Morning: landmark / museum block",
          "Afternoon: neighborhood food crawl",
          "Evening: transit rehearsal for departure day",
        ],
      };
    });

  const flightCost = Number(flight?.priceUsd ?? 0) * trip.travelers;
  const hotelCost = Number(hotel?.totalUsd ?? 0);
  const estimateUsd = Number((flightCost + hotelCost).toFixed(2));
  const live = liveDays != null;

  return {
    type: "travel-itinerary",
    mode: live ? "live-web" : "testnet-demo",
    summary: `Itinerary ${trip.origin} → ${trip.destination} (${trip.departDate}–${trip.returnDate}). Est. total ~$${estimateUsd} for selected flight + stay.`,
    trip,
    selectedFlight: flight ?? null,
    selectedHotel: hotel ?? null,
    days,
    budgetEstimateUsd: estimateUsd,
    searchUrls: {
      flights: googleFlightsUrl(trip),
      hotels: bookingSearchUrl(trip),
    },
    nextSteps: [
      "Open the flight book link and confirm seats/fare rules",
      "Open the hotel book link and confirm cancellation policy",
      `Recheck passport/visa requirements for ${trip.destination} before booking`,
    ],
    disclaimer: live
      ? "Live web-sourced itinerary sketch — not a ticketed reservation. Verify times and opening hours before travel."
      : "Demo itinerary — not a confirmed reservation.",
    generatedAt: new Date().toISOString(),
  };
}
