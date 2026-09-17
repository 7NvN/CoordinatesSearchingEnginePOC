const test = require('node:test');
const assert = require('node:assert/strict');
const { findMatchingRides } = require('../src/matcher');

const line = [
  [78.34, 17.45],
  [78.36, 17.44],
  [78.37, 17.43],
];

function trip(overrides = {}) {
  return {
    tripId: 'T1',
    driverName: 'Test Driver',
    routeName: 'Office hop',
    vehicle: 'Test Car',
    departureTime: '09:00 AM',
    departureAt: '2026-09-17T09:00:00+05:30',
    availableSeats: 2,
    geometry: { type: 'LineString', coordinates: line },
    ...overrides,
  };
}

const pickup = [78.3402, 17.4501];
const drop = [78.3698, 17.4301];

test('matches a nearby same-direction rider', () => {
  const matches = findMatchingRides([trip()], pickup, drop, { maxWalkMeters: 500 });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].tripId, 'T1');
  assert.ok(matches[0].matchDetails.sharedRideDistanceKm > 0);
  assert.ok(matches[0].board);
  assert.ok(matches[0].alight);
});

test('skips a rider who is too far from the line', () => {
  const matches = findMatchingRides([trip()], [77.0, 16.0], [77.1, 16.1], { maxWalkMeters: 500 });
  assert.equal(matches.length, 0);
});

test('skips the opposite direction', () => {
  const matches = findMatchingRides([trip()], drop, pickup, { maxWalkMeters: 500 });
  assert.equal(matches.length, 0);
});

test('skips trips with no seats', () => {
  const matches = findMatchingRides([trip({ availableSeats: 0 })], pickup, drop, { maxWalkMeters: 500 });
  assert.equal(matches.length, 0);
});

test('ranks by smallest total walking distance', () => {
  const near = trip({ tripId: 'NEAR' });
  const farTrip = trip({
    tripId: 'FAR',
    geometry: {
      type: 'LineString',
      coordinates: [
        [78.342, 17.453],
        [78.362, 17.443],
        [78.372, 17.433],
      ],
    },
  });
  const matches = findMatchingRides([farTrip, near], pickup, drop, { maxWalkMeters: 2000 });
  assert.equal(matches.length, 2);
  assert.ok(
    matches[0].matchDetails.totalDetourMeters <= matches[1].matchDetails.totalDetourMeters
  );
  assert.equal(matches[0].tripId, 'NEAR');
});

test('filters by departure window', () => {
  const matches = findMatchingRides([trip()], pickup, drop, {
    maxWalkMeters: 500,
    departAfter: '2026-09-17T10:00:00+05:30',
    departBefore: '2026-09-17T11:00:00+05:30',
  });
  assert.equal(matches.length, 0);
});

test('debug mode reports skip reasons', () => {
  const result = findMatchingRides(
    [trip({ availableSeats: 0 })],
    pickup,
    drop,
    { maxWalkMeters: 500, debug: true }
  );
  assert.equal(result.matches.length, 0);
  assert.equal(result.skipped[0].reason, 'no_seats');
});
