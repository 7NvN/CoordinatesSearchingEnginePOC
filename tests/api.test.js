const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const { createApp } = require('../src/server');

const PICKUP = { lng: 78.34588, lat: 17.450918 };
const DROP = { lng: 78.3691652, lat: 17.4342597 };

let app;
let db;
let tempDir;
let routeCalls = 0;

async function fakeRouteProvider(origin, destination) {
  routeCalls += 1;
  return {
    success: true,
    summary: { distanceKm: '4.20', durationMins: '12.0' },
    distanceM: 4200,
    durationS: 720,
    lineString: {
      type: 'LineString',
      coordinates: [
        [origin.lng, origin.lat],
        [destination.lng, destination.lat],
      ],
    },
  };
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'carpool-api-'));
  const created = await createApp({
    dbPath: path.join(tempDir, 'test.sqlite'),
    seedTripsPath: path.join(__dirname, '..', 'data', 'seed-trips.json'),
    routeProvider: fakeRouteProvider,
    readinessProvider: async () => ({ ok: true, provider: 'test-osrm' }),
  });
  app = created.app;
  db = created.db;
});

test.after(() => {
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health and readiness distinguish liveness from dependencies', async () => {
  const health = await request(app).get('/health').expect(200);
  assert.equal(health.body.ok, true);

  const ready = await request(app).get('/ready').expect(200);
  assert.equal(ready.body.ready, true);
  assert.equal(ready.body.osrm.provider, 'test-osrm');
});

test('default search has a deterministic match in the departure window', async () => {
  const result = await request(app)
    .post('/v1/search')
    .send({
      pickup: PICKUP,
      drop: DROP,
      maxWalkMeters: 500,
      departAfter: new Date(Date.now() - 60_000).toISOString(),
      departBefore: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    })
    .expect(200);

  assert.ok(result.body.matches.length >= 1);
  assert.equal(result.body.matches[0].tripId, 'DEMO_ORION_GACHIBOWLI');
});

test('search rejects an invalid departure window', async () => {
  await request(app)
    .post('/v1/search')
    .send({
      pickup: PICKUP,
      drop: DROP,
      departAfter: 'not-a-date',
    })
    .expect(400, { error: 'departAfter must be a valid date' });
});

test('publish obtains geometry from the route provider', async () => {
  const before = routeCalls;
  const result = await request(app)
    .post('/v1/trips')
    .send({
      origin: PICKUP,
      destination: DROP,
      departureAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      seats: 2,
      routeName: 'API integration trip',
      geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] },
    })
    .expect(201);

  assert.equal(routeCalls, before + 1);
  assert.deepEqual(result.body.trip.geometry.coordinates[0], [PICKUP.lng, PICKUP.lat]);
});

test('booking is unique per rider and cancellation restores the seat', async () => {
  const booking = await request(app)
    .post('/v1/trips/DEMO_ORION_GACHIBOWLI/bookings')
    .send({ pickup: PICKUP, drop: DROP, riderId: 'u_rider', maxWalkMeters: 500 })
    .expect(201);
  assert.equal(booking.body.trip.seatsLeft, 2);

  await request(app)
    .post('/v1/trips/DEMO_ORION_GACHIBOWLI/bookings')
    .send({ pickup: PICKUP, drop: DROP, riderId: 'u_rider', maxWalkMeters: 500 })
    .expect(409);

  const cancelled = await request(app)
    .post(`/v1/bookings/${booking.body.booking.id}/cancel`)
    .expect(200);
  assert.equal(cancelled.body.booking.status, 'cancelled');
  assert.equal(cancelled.body.trip.seatsLeft, 3);
});

test('only one concurrent request can claim the final seat', async () => {
  const trip = await request(app)
    .post('/v1/trips')
    .send({
      origin: PICKUP,
      destination: DROP,
      departureAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      seats: 1,
      routeName: 'Last seat trip',
    })
    .expect(201);

  const attempts = await Promise.all([
    request(app)
      .post(`/v1/trips/${trip.body.trip.id}/bookings`)
      .send({ pickup: PICKUP, drop: DROP, riderId: 'rider_a', maxWalkMeters: 500 }),
    request(app)
      .post(`/v1/trips/${trip.body.trip.id}/bookings`)
      .send({ pickup: PICKUP, drop: DROP, riderId: 'rider_b', maxWalkMeters: 500 }),
  ]);

  assert.deepEqual(attempts.map((response) => response.status).sort(), [201, 409]);
});
