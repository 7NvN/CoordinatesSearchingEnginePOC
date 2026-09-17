const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const HYD_LNG_MIN = 77.5;
const HYD_LNG_MAX = 79.0;
const HYD_LAT_MIN = 16.5;
const HYD_LAT_MAX = 18.5;

function isHyderabadRoute(route) {
  const first = route.geometry?.coordinates?.[0];
  if (!first) return false;
  const [lng, lat] = first;
  return lng >= HYD_LNG_MIN && lng <= HYD_LNG_MAX && lat >= HYD_LAT_MIN && lat <= HYD_LAT_MAX;
}

function parseClockToToday(clockText) {
  const match = String(clockText || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);
  if (!match) return date.toISOString();
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() < now.getTime() - 60 * 60 * 1000) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
}

function openDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      label TEXT NOT NULL,
      seats_total INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trips (
      id TEXT PRIMARY KEY,
      driver_id TEXT NOT NULL,
      vehicle_id TEXT,
      driver_name TEXT NOT NULL,
      route_name TEXT,
      vehicle_label TEXT,
      origin_lng REAL NOT NULL,
      origin_lat REAL NOT NULL,
      dest_lng REAL NOT NULL,
      dest_lat REAL NOT NULL,
      departure_at TEXT NOT NULL,
      seats_total INTEGER NOT NULL,
      seats_left INTEGER NOT NULL,
      status TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS trip_geometry (
      trip_id TEXT PRIMARY KEY,
      geojson TEXT NOT NULL,
      distance_m REAL,
      duration_s REAL
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      trip_id TEXT NOT NULL,
      rider_id TEXT NOT NULL,
      pickup_lng REAL NOT NULL,
      pickup_lat REAL NOT NULL,
      drop_lng REAL NOT NULL,
      drop_lat REAL NOT NULL,
      walk_pickup_m INTEGER,
      walk_drop_m INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

function ensureBaseRecords(db) {
  const now = new Date().toISOString();
  const insertUser = db.prepare(
    'INSERT OR IGNORE INTO users (id, role, name, phone, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  insertUser.run('u_rider', 'rider', 'Neha Rider', '+91-9000000001', now);
  insertUser.run('u_driver', 'driver', 'Arjun Driver', '+91-9000000002', now);
  db.prepare(
    'INSERT OR IGNORE INTO vehicles (id, user_id, label, seats_total) VALUES (?, ?, ?, ?)'
  ).run('v_demo', 'u_driver', 'Demo Hatchback', 3);
}

async function seedIfEmpty(db, routesDbPath, getRouteLineString) {
  ensureBaseRecords(db);
  const count = db.prepare('SELECT COUNT(*) AS n FROM trips').get().n;
  if (count > 0) return;

  if (typeof getRouteLineString !== 'function') {
    throw new Error('Cannot seed trips without an OSRM route function');
  }

  const raw = JSON.parse(fs.readFileSync(routesDbPath, 'utf8'));
  const hydRoutes = raw.filter(isHyderabadRoute);
  const insertTrip = db.prepare(`
    INSERT INTO trips (
      id, driver_id, vehicle_id, driver_name, route_name, vehicle_label,
      origin_lng, origin_lat, dest_lng, dest_lat, departure_at,
      seats_total, seats_left, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `);
  const insertGeom = db.prepare(
    'INSERT INTO trip_geometry (trip_id, geojson, distance_m, duration_s) VALUES (?, ?, ?, ?)'
  );

  let seeded = 0;
  for (const [index, route] of hydRoutes.entries()) {
    const coords = route.geometry.coordinates;
    const origin = coords[0];
    const dest = coords[coords.length - 1];
    const tripId = route.routeId || `seed_${index + 1}`;
    const preview = await getRouteLineString(
      { lng: origin[0], lat: origin[1] },
      { lng: dest[0], lat: dest[1] }
    );
    if (!preview.success) {
      console.warn(`Skipping ${tripId}: OSRM could not build a driving route (${preview.error})`);
      continue;
    }
    insertTrip.run(
      tripId,
      'u_driver',
      'v_demo',
      route.driverName,
      route.routeName,
      route.vehicle,
      origin[0],
      origin[1],
      dest[0],
      dest[1],
      parseClockToToday(route.departureTime),
      route.availableSeats,
      route.availableSeats
    );
    insertGeom.run(
      tripId,
      JSON.stringify(preview.lineString),
      preview.distanceM ?? null,
      preview.durationS ?? null
    );
    seeded += 1;
  }

  if (seeded === 0) {
    throw new Error('No trips seeded: OSRM did not return any authentic driving routes');
  }
  console.log(`Seeded ${seeded} Hyderabad trip(s) from OSRM driving routes`);
}

function listSearchTrips(db) {
  const rows = db.prepare(`
    SELECT t.*, g.geojson
    FROM trips t
    JOIN trip_geometry g ON g.trip_id = t.id
    WHERE t.status IN ('published', 'full')
  `).all();

  return rows.map((row) => ({
    tripId: row.id,
    driverName: row.driver_name,
    routeName: row.route_name,
    vehicle: row.vehicle_label,
    departureTime: row.departure_at,
    departureAt: row.departure_at,
    availableSeats: row.seats_left,
    geometry: JSON.parse(row.geojson),
    status: row.status,
  }));
}

function getTrip(db, id) {
  const row = db.prepare(`
    SELECT t.*, g.geojson, g.distance_m, g.duration_s
    FROM trips t
    LEFT JOIN trip_geometry g ON g.trip_id = t.id
    WHERE t.id = ?
  `).get(id);
  if (!row) return null;
  return {
    id: row.id,
    driverId: row.driver_id,
    driverName: row.driver_name,
    routeName: row.route_name,
    vehicle: row.vehicle_label,
    origin: { lng: row.origin_lng, lat: row.origin_lat },
    destination: { lng: row.dest_lng, lat: row.dest_lat },
    departureAt: row.departure_at,
    seatsTotal: row.seats_total,
    seatsLeft: row.seats_left,
    status: row.status,
    distanceM: row.distance_m,
    durationS: row.duration_s,
    geometry: row.geojson ? JSON.parse(row.geojson) : null,
  };
}

function createTrip(db, payload) {
  const id = crypto.randomUUID();
  const vehicleId = payload.vehicleId || 'v_demo';
  db.prepare(`
    INSERT INTO trips (
      id, driver_id, vehicle_id, driver_name, route_name, vehicle_label,
      origin_lng, origin_lat, dest_lng, dest_lat, departure_at,
      seats_total, seats_left, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published')
  `).run(
    id,
    payload.driverId,
    vehicleId,
    payload.driverName,
    payload.routeName,
    payload.vehicleLabel,
    payload.origin[0],
    payload.origin[1],
    payload.destination[0],
    payload.destination[1],
    payload.departureAt,
    payload.seats,
    payload.seats
  );
  db.prepare(
    'INSERT INTO trip_geometry (trip_id, geojson, distance_m, duration_s) VALUES (?, ?, ?, ?)'
  ).run(id, JSON.stringify(payload.geometry), payload.distanceM ?? null, payload.durationS ?? null);
  return getTrip(db, id);
}

function createBooking(db, payload) {
  const bookingId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const tx = db.transaction(() => {
    const updated = db.prepare(`
      UPDATE trips
      SET seats_left = seats_left - 1,
          status = CASE WHEN seats_left - 1 <= 0 THEN 'full' ELSE status END
      WHERE id = ? AND seats_left > 0 AND status = 'published'
    `).run(payload.tripId);

    if (updated.changes === 0) {
      const error = new Error('No seats left on this trip');
      error.statusCode = 409;
      throw error;
    }

    db.prepare(`
      INSERT INTO bookings (
        id, trip_id, rider_id, pickup_lng, pickup_lat, drop_lng, drop_lat,
        walk_pickup_m, walk_drop_m, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
    `).run(
      bookingId,
      payload.tripId,
      payload.riderId,
      payload.pickup[0],
      payload.pickup[1],
      payload.drop[0],
      payload.drop[1],
      payload.walkPickupM ?? null,
      payload.walkDropM ?? null,
      createdAt
    );
  });
  tx();
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
}

function cancelBooking(db, bookingId) {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  if (booking.status === 'cancelled') {
    return booking;
  }

  const tx = db.transaction(() => {
    db.prepare(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`).run(bookingId);
    db.prepare(`
      UPDATE trips
      SET seats_left = seats_left + 1,
          status = CASE WHEN status = 'full' THEN 'published' ELSE status END
      WHERE id = ?
    `).run(booking.trip_id);
  });
  tx();
  return db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
}

function listBookings(db, riderId) {
  return db.prepare(`
    SELECT b.*, t.route_name, t.driver_name, t.departure_at, t.status AS trip_status
    FROM bookings b
    JOIN trips t ON t.id = b.trip_id
    WHERE (? IS NULL OR b.rider_id = ?)
    ORDER BY b.created_at DESC
  `).all(riderId || null, riderId || null);
}

function listUsers(db) {
  return db.prepare('SELECT id, role, name, phone FROM users ORDER BY name').all();
}

module.exports = {
  openDb,
  ensureBaseRecords,
  seedIfEmpty,
  listSearchTrips,
  getTrip,
  createTrip,
  createBooking,
  cancelBooking,
  listBookings,
  listUsers,
};
