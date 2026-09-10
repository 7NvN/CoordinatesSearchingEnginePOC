# Implementation Plan — Coordinates Searching Engine

Current state: a Node.js proof of concept. `search_engine.js` matches a hardcoded rider
pickup/drop against driver routes stored in `routes_db.json` using Turf.js, and
`get_route.js` fetches a road path from OSRM.

This document is the plan to turn that POC into something publishable on the web,
and later as a mobile app. Treat **v1 as a demo web product**, not a marketplace.

---

## 1. Product scope

**v1 (publishable demo)**

- Rider: drop two map pins (pickup, drop), set max walk (default 500 m), see ranked rides.
- Driver: origin, destination, departure time, seats. The system builds a LineString via
  OSRM and stores it.
- Rider can request a seat; driver auto-accepts in v1. Seat count goes down.
- One city only (Hyderabad) so matching actually returns results.

**Out of scope for v1**

Native app, payments, live GPS, chat, ratings, KYC, multi-city data, street-level
walking routes.

**v2**

Auth, time windows, booking conflicts, cancellation, notifications, PostGIS, then a thin
mobile client on the same API.

---

## 2. Architecture

```
[Map UI: React + MapLibre]
        HTTPS JSON
[API: Node (Fastify or Express)]
   |-- matcher      (extracted from search_engine.js)
   |-- OSRM client  (extracted from get_route.js)
   +-- database
```

One backend. Web and any later app call the same API. Ranking stays server side: route
geometries are large, and duplicating the logic in the browser would fork it.

**Coordinate rule:** GeoJSON order `[lng, lat]` everywhere internally. The API also
accepts `{ lat, lng }` objects and converts once at the edge, so the UI cannot mix order.

**OSRM:** the public `router.project-osrm.org` is fine for the demo only (rate limits, no
SLA). Production needs self-hosted OSRM or a paid provider.

---

## 3. Data model

```
users          id, role (rider|driver|both), name, phone, created_at
vehicles       id, user_id, label, seats_total
trips          id, driver_id, vehicle_id, origin_lng/lat, dest_lng/lat,
               departure_at, seats_total, seats_left,
               status (draft|published|full|cancelled|completed)
trip_geometry  trip_id, geojson LineString, distance_m, duration_s
bookings       id, trip_id, rider_id, pickup_lng/lat, drop_lng/lat,
               walk_pickup_m, walk_drop_m, status (requested|confirmed|cancelled)
```

Seed from the existing `routes_db.json` as published Hyderabad trips. Drop or tag the
non-Hyderabad dummy routes so the demo is not empty.

**Seat integrity** — confirm a booking with a conditional update inside a transaction:

```sql
UPDATE trips SET seats_left = seats_left - 1
WHERE id = ? AND seats_left > 0 AND status = 'published'
```

Zero rows updated means the trip is full.

---

## 4. API contract

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/v1/routes/preview` | origin + destination to LineString, km, minutes (OSRM) |
| `POST` | `/v1/trips` | publish a trip (calls preview, stores geometry and seats) |
| `GET` | `/v1/trips/:id` | trip plus geometry for the map |
| `POST` | `/v1/search` | pickup, drop, `maxWalkMeters`, optional departure window |
| `POST` | `/v1/trips/:id/bookings` | reserve a seat |
| `POST` | `/v1/bookings/:id/cancel` | release a seat |
| `GET` | `/health` | liveness |

Request body for `POST /v1/search`:

```json
{
  "pickup": { "lng": 78.34588, "lat": 17.450918 },
  "drop": { "lng": 78.3691652, "lat": 17.4342597 },
  "maxWalkMeters": 500,
  "departAfter": "2026-09-10T08:00:00+05:30",
  "departBefore": "2026-09-10T10:00:00+05:30"
}
```

Each match keeps the POC fields and adds map-ready snap points:

```json
{
  "tripId": "ROUTE_004",
  "driverName": "Sneha K",
  "routeName": "Hitec City to Financial District (via Gachibowli)",
  "vehicle": "Tata Nexon (Blue)",
  "departureTime": "08:50 AM",
  "availableSeats": 3,
  "matchDetails": {
    "pickupWalkDistanceMeters": 120,
    "dropWalkDistanceMeters": 80,
    "totalDetourMeters": 200,
    "sharedRideDistanceKm": 4.12
  },
  "board": { "lng": 78.3559, "lat": 17.4509 },
  "alight": { "lng": 78.3637, "lat": 17.4395 }
}
```

`board` and `alight` are the snapped points on the driver line, so the map can draw the
walking stubs.

Errors: `400` invalid coordinates, `404` unknown trip, `409` no seats left, `502` OSRM
unavailable.

---

## 5. Matcher

Keep the POC logic as a pure function
`findMatchingRides(trips, pickup, drop, maxWalkMeters)` with the same three filters:
walking distance, direction (`pickupProgress < dropProgress`), and available seats.

Add for v1:

- Departure time window filter, applied before the Turf math because it is cheaper.
- Bounding box prefilter to skip trips whose envelope is far from both points.
- Skip reasons (`too_far`, `wrong_direction`, `no_seats`, `time`) in development responses.
- Configurable `maxWalkMeters`, capped at about 2000.
- Unit tests: too far, reverse direction (ROUTE_005), zero seats, ranking order.

Not in v1: true pedestrian routing, live traffic, matching against the raw CSV.

Extract the matcher to `src/matcher.js`. `search_engine.js` can stay as a thin CLI that
calls the same function.

---

## 6. Web UI

1. **Search** — MapLibre map, two pins, walk-distance slider (200–1000 m), Search button.
2. **Results** — list sorted by total walking distance; selecting one highlights the
   polyline and the board/alight markers.
3. **Publish trip** — two pins, departure datetime, seat count, Preview path, Publish.
4. **My trip / booking** — seats left, cancel.

No login in v1: a header toggle ("Act as: Rider | Driver") backed by seeded user ids.
Auth arrives in v2 without touching the matcher.

Maps: MapLibre with OSM tiles, so the demo needs no Google key.

---

## 7. Auth, safety, legal

- v2: phone OTP or email magic link; light driver verification.
- Avoid requiring a home address pin in v1; keep the demo around office parks.
- State clearly that this is a carpool matching demo, not a taxi service and not
  real-time tracking.
- Cache OSRM previews by rounding origin/destination to a ~50 m grid to avoid hammering
  the public server.
- Rate limit `/v1/search` and `/v1/routes/preview`.
- CORS restricted to the web origin.
- No secrets in the repository; use `.env` for map and OSRM configuration.

---

## 8. Operations and quality

- Node 18+, `npm run dev` for the API and `npm run web` for the UI.
- Docker Compose later: `api`, `postgres`, optionally a local OSRM.
- Tests: matcher unit tests first, then one API test covering search, book, and full.
- Logging: request id, trip id, match count, OSRM latency.
- Health check includes OSRM. If OSRM is down, search still works on stored geometry
  while publish and preview fail with a clear message.

---

## 9. Mobile

Same API. Do not start React Native until search, publish, and booking work on the web.
The first mobile build is a map screen and a results list.

---

## 10. Repository layout

```
src/matcher.js          extracted POC logic
src/osrm.js             cleaned get_route.js
src/db/                 SQLite first, Postgres later
src/routes/*.js         HTTP handlers
web/                    Vite + React + MapLibre
data/seed.json          cleaned Hyderabad routes
tests/matcher.test.js
```

Start with SQLite storing GeoJSON in a column. Move to PostGIS when the bounding box
prefilter is no longer enough. No microservices.

---

## 11. Implementation order

Each step should leave the app runnable.

1. Extract the matcher and add unit tests (no HTTP yet).
2. Add the API server and `POST /v1/search` over the seed data.
3. Add OSRM `POST /v1/routes/preview` and `POST /v1/trips`.
4. Persist trips and bookings in SQLite, with the atomic seat update.
5. Vite map UI: search and draw matches.
6. Publish-trip UI plus book and cancel.
7. Departure window, bounding box prefilter, Hyderabad-only seed cleanup.
8. README, `.env.example`, rate limiting, health endpoint.
9. (v2) Auth, PostGIS, notifications, mobile app.

Steps 1–6 give a working web demo. Adding 7–8 plus a hosted URL makes it presentable to
customers.

---

## 12. Decisions to freeze before implementation

| Topic | Recommendation |
| --- | --- |
| Language | Stay on JavaScript to match the POC; TypeScript optional on the API |
| API framework | Fastify or Express, REST under `/v1` |
| Database (v1) | SQLite |
| Maps | MapLibre with OSM tiles |
| Routing | Public OSRM, with caching |
| Auth (v1) | Seeded users, no login |
| City | Hyderabad only |
| Booking | Immediate confirmation with an atomic seat decrement |

If Docker is already part of your workflow, using Postgres from day one is reasonable.
Otherwise SQLite ships faster.
