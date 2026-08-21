/** Library rendering for travel ETF deliverables (flights, hotels, itinerary). */

import type { ReactNode } from "react";

export function isFlightSearchPayload(data: Record<string, unknown>): boolean {
  return data.type === "flight-search" || Array.isArray(data.flights);
}

export function isHotelSearchPayload(data: Record<string, unknown>): boolean {
  return data.type === "hotel-search" || Array.isArray(data.hotels);
}

export function isTravelItineraryPayload(data: Record<string, unknown>): boolean {
  return data.type === "travel-itinerary" || Array.isArray(data.days);
}

export function isTravelPayload(data: Record<string, unknown>): boolean {
  if (data.type === "travel-package" || data.type === "travel-itinerary" || data.type === "flight-search" || data.type === "hotel-search") {
    return true;
  }
  return (
    Array.isArray(data.flights) ||
    Array.isArray(data.hotels) ||
    Array.isArray(data.days) ||
    (data.type === "combined" &&
      (Array.isArray(data.flights) || Array.isArray(data.hotels) || Array.isArray(data.days)))
  );
}

function Money({ n }: { n: unknown }) {
  const v = Number(n);
  if (!Number.isFinite(v)) return <>—</>;
  return <>${v.toFixed(0)}</>;
}

export function FlightSearchBlock({ data }: { data: Record<string, unknown> }) {
  const flights = Array.isArray(data.flights) ? data.flights : [];
  const trip = (data.trip ?? {}) as Record<string, unknown>;
  const summary =
    typeof data.flightSummary === "string"
      ? data.flightSummary
      : data.type === "travel-package"
        ? null
        : typeof data.summary === "string"
          ? data.summary
          : null;
  const searchUrl = typeof data.searchUrl === "string" ? data.searchUrl : null;
  const marketFrom = Number(data.marketFromUsd);
  return (
    <section className="paper-section">
      <h2 className="paper-section-title">Flight options</h2>
      {summary && <p className="paper-prose">{summary}</p>}
      <p className="paper-inline-meta">
        {String(trip.origin ?? "")} ({String(trip.originCode ?? "")}) → {String(trip.destination ?? "")} (
        {String(trip.destinationCode ?? "")}) · {String(trip.departDate ?? "")}
        {Number.isFinite(marketFrom) && marketFrom > 0 ? ` · market from ~$${marketFrom.toFixed(0)}` : ""}
        {data.mode === "live-web" ? " · Live web" : data.mode === "testnet-demo" ? " · Demo" : ""}
      </p>
      {searchUrl && (
        <p className="paper-prose">
          <a href={searchUrl} target="_blank" rel="noreferrer">
            Open live Google Flights for this exact trip
          </a>
          {" — use this for booking decisions; listed fares can move."}
        </p>
      )}
      <ol className="paper-numbered-list">
        {flights.map((row, i) => {
          const f = row as Record<string, unknown>;
          const bookUrl = typeof f.bookUrl === "string" ? f.bookUrl : searchUrl;
          return (
            <li key={i}>
              <strong>
                {String(f.carrier ?? "Carrier")} {String(f.flightNumber ?? "")}
              </strong>
              <span className="paper-ref-meta">
                {" "}
                — <Money n={f.priceUsd} /> · {String(f.note ?? "")} · {String(f.durationHours ?? "?")}h
                {f.departAt ? ` · dep ${String(f.departAt).replace("T", " ").slice(0, 16)}` : ""}
              </span>
              {bookUrl && (
                <div className="paper-ref-meta">
                  <a href={bookUrl} target="_blank" rel="noreferrer">
                    Confirm on Google Flights
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {flights.length === 0 && (
        <p className="paper-prose">
          No verified flight quotes for this run
          {searchUrl ? (
            <>
              {" — "}
              <a href={searchUrl} target="_blank" rel="noreferrer">
                open Google Flights for live fares
              </a>
            </>
          ) : null}
          .
        </p>
      )}
      {typeof data.disclaimer === "string" && <p className="paper-prose paper-ref-meta">{data.disclaimer}</p>}
    </section>
  );
}

export function HotelSearchBlock({ data }: { data: Record<string, unknown> }) {
  const hotels = Array.isArray(data.hotels) ? data.hotels : [];
  const trip = (data.trip ?? {}) as Record<string, unknown>;
  const summary =
    typeof data.hotelSummary === "string"
      ? data.hotelSummary
      : data.type === "travel-package"
        ? null
        : typeof data.summary === "string"
          ? data.summary
          : null;
  const searchUrl = typeof data.searchUrl === "string" ? data.searchUrl : null;
  return (
    <section className="paper-section">
      <h2 className="paper-section-title">Stay options — {String(trip.destination ?? "destination")}</h2>
      {summary && <p className="paper-prose">{summary}</p>}
      {searchUrl && (
        <p className="paper-prose">
          <a href={searchUrl} target="_blank" rel="noreferrer">
            Open Booking.com for these dates
          </a>
        </p>
      )}
      <ol className="paper-numbered-list">
        {hotels.map((row, i) => {
          const h = row as Record<string, unknown>;
          const bookUrl = typeof h.bookUrl === "string" ? h.bookUrl : searchUrl;
          return (
            <li key={i}>
              <strong>{String(h.name ?? "Hotel")}</strong>
              <span className="paper-ref-meta">
                {" "}
                — {String(h.stars ?? "")}★ · {String(h.neighborhood ?? "")} · total <Money n={h.totalUsd} /> (
                {String(h.nights ?? "?")} nights · ~<Money n={h.nightlyUsd} />/night)
              </span>
              {typeof h.address === "string" && h.address && (
                <div className="paper-ref-meta">{h.address}</div>
              )}
              {bookUrl && (
                <div className="paper-ref-meta">
                  <a href={bookUrl} target="_blank" rel="noreferrer">
                    Confirm on Booking.com
                  </a>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {hotels.length === 0 && (
        <p className="paper-prose">
          No verified hotel names for this run
          {searchUrl ? (
            <>
              {" — "}
              <a href={searchUrl} target="_blank" rel="noreferrer">
                open Booking.com for live stays
              </a>
            </>
          ) : null}
          .
        </p>
      )}
      {typeof data.disclaimer === "string" && <p className="paper-prose paper-ref-meta">{data.disclaimer}</p>}
    </section>
  );
}

export function TravelItineraryBlock({ data }: { data: Record<string, unknown> }) {
  const days = Array.isArray(data.days) ? data.days : [];
  const nextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];
  const summary =
    typeof data.itinerarySummary === "string"
      ? data.itinerarySummary
      : data.type === "travel-package"
        ? null
        : typeof data.summary === "string"
          ? data.summary
          : null;
  return (
    <section className="paper-section">
      <h2 className="paper-section-title">Itinerary</h2>
      {summary && <p className="paper-prose">{summary}</p>}
      {data.budgetEstimateUsd != null && (
        <p className="paper-inline-meta">
          Est. flights + stay: <Money n={data.budgetEstimateUsd} />
        </p>
      )}
      {days.map((row, i) => {
        const d = row as Record<string, unknown>;
        const items = Array.isArray(d.items) ? d.items : [];
        return (
          <div key={i} className="paper-subsection">
            <h3 className="paper-section-title">
              {String(d.date ?? "")} — {String(d.title ?? `Day ${i + 1}`)}
            </h3>
            <ul className="paper-bullet-list">
              {items.map((item, j) => (
                <li key={j}>{String(item)}</li>
              ))}
            </ul>
          </div>
        );
      })}
      {nextSteps.length > 0 && (
        <>
          <h3 className="paper-section-title">Next steps</h3>
          <ol className="paper-numbered-list">
            {nextSteps.map((s, i) => (
              <li key={i}>{String(s)}</li>
            ))}
          </ol>
        </>
      )}
      {typeof data.disclaimer === "string" && <p className="paper-prose paper-ref-meta">{data.disclaimer}</p>}
    </section>
  );
}

export function TravelDeliverableBody({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="paper-intel-root">
      {isFlightSearchPayload(payload) && <FlightSearchBlock data={payload} />}
      {isHotelSearchPayload(payload) && <HotelSearchBlock data={payload} />}
      {isTravelItineraryPayload(payload) && <TravelItineraryBlock data={payload} />}
    </div>
  );
}

export function renderTravelBlocks(steps: { output?: unknown }[]): ReactNode[] {
  const blocks: React.ReactNode[] = [];
  for (const step of steps) {
    const raw = step.output;
    if (!raw || typeof raw !== "object") continue;
    const data = raw as Record<string, unknown>;
    const inner = (data.data && typeof data.data === "object" ? data.data : data) as Record<string, unknown>;
    if (isFlightSearchPayload(inner)) blocks.push(<FlightSearchBlock key={`f-${blocks.length}`} data={inner} />);
    if (isHotelSearchPayload(inner)) blocks.push(<HotelSearchBlock key={`h-${blocks.length}`} data={inner} />);
    if (isTravelItineraryPayload(inner)) blocks.push(<TravelItineraryBlock key={`i-${blocks.length}`} data={inner} />);
  }
  return blocks;
}
