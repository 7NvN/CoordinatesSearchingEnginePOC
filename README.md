# Carpool route matcher (v1 demo)

Hyderabad carpool matching demo. A rider drops pickup and drop pins; the API snaps those
points onto stored driver LineStrings with Turf.js and ranks rides by walking distance.

This is a **carpool matching demo**, not a taxi service and not live tracking.

Full write-up, architecture diagrams, and line-by-line run steps: [V1.md](./V1.md).

## Run

Node 18+ recommended.

```bash
npm install
npm test
npm run dev
```

In a second terminal:

```bash
npm install --prefix web
npm run web
```

- API: http://localhost:3001/health
- UI: http://localhost:5173

The first API start takes Hyderabad origin/destination pairs from `routes_db.json`
(ROUTE_003–005) and **rebuilds each path with OSRM driving directions**. Dummy
LineStrings are never stored. Publish also always calls OSRM; the UI cannot upload
a custom geometry.

## Demo flow

1. Open the UI. Default pins are near Divyasree Orion → Gachibowli.
2. Click **Search rides**. Select a result to draw the driver path and board/alight points.
3. **Book seat** (as Rider). Seats decrement atomically.
4. Switch to **Driver**, set origin/destination on the map, **Preview path** (OSRM), **Publish trip**.
5. **Bookings** lists rider bookings; **Cancel** restores the seat.

Map clicks alternate pickup/drop (search) or origin/destination (publish).

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API + OSRM status |
| POST | `/v1/search` | Rank matching published trips |
| POST | `/v1/routes/preview` | OSRM LineString (cached ~100 m grid) |
| POST | `/v1/trips` | Publish a trip |
| GET | `/v1/trips/:id` | Trip + geometry |
| POST | `/v1/trips/:id/bookings` | Confirm a seat |
| POST | `/v1/bookings/:id/cancel` | Release a seat |

Search body:

```json
{
  "pickup": { "lng": 78.34588, "lat": 17.450918 },
  "drop": { "lng": 78.3691652, "lat": 17.4342597 },
  "maxWalkMeters": 500
}
```

Coordinates are `{ lat, lng }` or GeoJSON `[lng, lat]`. Walking distance is capped at 2000 m.

Seeded users: `u_rider` (Neha), `u_driver` (Arjun). No login in v1.

## Original POC scripts

```bash
npm run poc:search
npm run poc:route
```

## Config

Copy `.env.example` if you need to change `PORT`, `OSRM_BASE_URL`, `DB_PATH`, or `CORS_ORIGIN`.
The public OSRM driving API is the only source of trip LineStrings.

On Windows networks that intercept HTTPS, start the API with the official Node
`--use-system-ca` flag (already in `npm run dev`) so the corporate CA is trusted.
Do not disable TLS.

## Layout

```
src/matcher.js    ranking (walk, direction, seats, time, bbox)
src/osrm.js       driving path + cache
src/db.js         SQLite schema, seed, bookings
src/server.js     Express /v1 API
web/              Vite + React + MapLibre
tests/            matcher unit tests
```
