/** Testnet travel search + itinerary payloads (demo quotes; swap for Duffel/Amadeus later). */

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

const CITY_CODES: Record<string, { name: string; code: string }> = {
  nyc: { name: "New York", code: "JFK" },
  "new york": { name: "New York", code: "JFK" },
  london: { name: "London", code: "LHR" },
  paris: { name: "Paris", code: "CDG" },
  tokyo: { name: "Tokyo", code: "NRT" },
  lagos: { name: "Lagos", code: "LOS" },
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
  "hong kong": { name: "Hong Kong", code: "HKG" },
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function findCity(text: string): { name: string; code: string } | null {
  const t = text.toLowerCase();
  const keys = Object.keys(CITY_CODES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (t.includes(key)) return CITY_CODES[key]!;
  }
  return null;
}

/** Parse a free-text travel brief into a structured trip (deterministic defaults for testnet). */
export function parseTravelTrip(brief?: string): TravelTrip {
  const t = (brief ?? "").toLowerCase();
  const fromMatch = t.match(/\b(?:from|depart(?:ing)?\s+from)\s+([a-z\s]+?)(?:\s+to\b|,|$)/i);
  const toMatch =
    t.match(/\b(?:to|for)\s+([a-z\s]+?)(?:\s+(?:from|next|in|on|for|march|april|may|june|july|august|september|october|november|december|\d)|$)/i) ||
    t.match(/\btrip to\s+([a-z\s]+)/i) ||
    t.match(/\bflights?\s+to\s+([a-z\s]+)/i);

  let origin = findCity(fromMatch?.[1] ?? "");
  let destination = findCity(toMatch?.[1] ?? t);

  if (!destination) destination = CITY_CODES.paris!;
  if (!origin || origin.code === destination.code) {
    origin = destination.code === "JFK" ? CITY_CODES.london! : CITY_CODES.nyc!;
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
  const trip = parseTravelTrip([brief, priorContext].filter(Boolean).join("\n"));
  const seed = hashSeed(`${trip.originCode}${trip.destinationCode}${trip.departDate}`);
  const flights = [0, 1, 2].map((i) => {
    const carrier = CARRIERS[(seed + i) % CARRIERS.length]!;
    const base = 180 + ((seed >> (i * 3)) % 420);
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
    disclaimer: "Testnet demo quotes — not a live booking. Confirm on a licensed OTA before purchase.",
    generatedAt: new Date().toISOString(),
  };
}

export async function buildHotelSearchPayload(brief?: string, priorContext?: string) {
  const trip = parseTravelTrip([brief, priorContext].filter(Boolean).join("\n"));
  const seed = hashSeed(`${trip.destinationCode}${trip.departDate}hotel`);
  const nights = Math.max(
    1,
    Math.round((new Date(trip.returnDate).getTime() - new Date(trip.departDate).getTime()) / 86_400_000)
  );

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
    disclaimer: "Testnet demo hotel quotes — availability is simulated.",
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
  const trip = parseTravelTrip([brief, context].filter(Boolean).join("\n"));
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
    Math.round((new Date(trip.returnDate).getTime() - new Date(trip.departDate).getTime()) / 86_400_000)
  );

  const days = Array.from({ length: Math.min(nights + 1, 5) }, (_, i) => {
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

  return {
    type: "travel-itinerary",
    mode: "testnet-demo",
    summary: `Itinerary ${trip.origin} → ${trip.destination} (${trip.departDate}–${trip.returnDate}). Est. total $${estimateUsd} for flights + stay (demo).`,
    trip,
    selectedFlight: flight ?? null,
    selectedHotel: hotel ?? null,
    days,
    budgetEstimateUsd: estimateUsd,
    nextSteps: [
      "Review flight and hotel options in Library",
      "Confirm dates and traveler count",
      "Book on a licensed OTA when ready (Butler testnet does not ticket yet)",
    ],
    disclaimer: "Demo itinerary for Arc testnet — not a confirmed reservation.",
    generatedAt: new Date().toISOString(),
  };
}
