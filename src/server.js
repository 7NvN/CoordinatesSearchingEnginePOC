const path = require('path');
const express = require('express');
const cors = require('cors');
const { assertLngLat, clampWalkMeters, toIsoOrNull } = require('./coords');
const { findMatchingRides } = require('./matcher');
const { getRouteLineString, checkOsrmHealth } = require('./osrm');
const dbApi = require('./db');

const hits = new Map();

function rateLimit(max, windowMs) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (recent.length > max) {
      return res.status(429).json({ error: 'Too many requests, try again shortly' });
    }
    return next();
  };
}

async function createApp(options = {}) {
  const dbPath = options.dbPath || process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.sqlite');
  const routesDbPath = options.routesDbPath || path.join(__dirname, '..', 'routes_db.json');
  const db = dbApi.openDb(dbPath);
  await dbApi.seedIfEmpty(db, routesDbPath, getRouteLineString);

  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin.split(',').map((s) => s.trim()) }));
  app.use(express.json({ limit: '1mb' }));

  app.use((req, res, next) => {
    req.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  app.get('/health', async (_req, res) => {
    const osrm = await checkOsrmHealth();
    res.json({
      ok: true,
      db: 'sqlite',
      osrm,
    });
  });

  app.get('/v1/users', (_req, res) => {
    res.json({ users: dbApi.listUsers(db) });
  });

  app.get('/v1/bookings', (req, res) => {
    res.json({ bookings: dbApi.listBookings(db, req.query.riderId || null) });
  });

  app.post('/v1/search', rateLimit(30, 60_000), (req, res, next) => {
    try {
      const pickup = assertLngLat(req.body?.pickup, 'pickup');
      const drop = assertLngLat(req.body?.drop, 'drop');
      const maxWalkMeters = clampWalkMeters(req.body?.maxWalkMeters);
      const departAfter = toIsoOrNull(req.body?.departAfter);
      const departBefore = toIsoOrNull(req.body?.departBefore);
      const debug = Boolean(req.body?.debug);

      const trips = dbApi.listSearchTrips(db).filter((trip) => trip.status === 'published' && trip.availableSeats > 0);
      const result = findMatchingRides(trips, pickup, drop, {
        maxWalkMeters,
        departAfter,
        departBefore,
        debug,
      });
      const matches = debug ? result.matches : result;
      console.log(JSON.stringify({
        requestId: req.requestId,
        path: '/v1/search',
        matchCount: matches.length,
      }));
      if (debug) {
        return res.json({ matches, skipped: result.skipped });
      }
      return res.json({ matches });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/v1/routes/preview', rateLimit(20, 60_000), async (req, res, next) => {
    try {
      const origin = assertLngLat(req.body?.origin, 'origin');
      const destination = assertLngLat(req.body?.destination, 'destination');
      const started = Date.now();
      const preview = await getRouteLineString(
        { lng: origin[0], lat: origin[1] },
        { lng: destination[0], lat: destination[1] }
      );
      console.log(JSON.stringify({
        requestId: req.requestId,
        path: '/v1/routes/preview',
        osrmMs: Date.now() - started,
        cached: preview.cached || false,
        success: preview.success,
      }));
      if (!preview.success) {
        return res.status(502).json({ error: preview.error || 'OSRM unavailable' });
      }
      return res.json({
        distanceKm: preview.summary.distanceKm,
        durationMins: preview.summary.durationMins,
        distanceM: preview.distanceM,
        durationS: preview.durationS,
        lineString: preview.lineString,
        cached: preview.cached,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/v1/trips', async (req, res, next) => {
    try {
      const origin = assertLngLat(req.body?.origin, 'origin');
      const destination = assertLngLat(req.body?.destination, 'destination');
      const seats = Number(req.body?.seats);
      if (!Number.isInteger(seats) || seats < 1 || seats > 8) {
        const error = new Error('seats must be an integer between 1 and 8');
        error.statusCode = 400;
        throw error;
      }
      const departureAt = toIsoOrNull(req.body?.departureAt) || new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const driverId = req.body?.driverId || 'u_driver';
      const users = dbApi.listUsers(db);
      const driver = users.find((u) => u.id === driverId) || { name: 'Arjun Driver' };

      const preview = await getRouteLineString(
        { lng: origin[0], lat: origin[1] },
        { lng: destination[0], lat: destination[1] }
      );
      if (!preview.success) {
        return res.status(502).json({ error: preview.error || 'OSRM unavailable' });
      }
      const geometry = preview.lineString;
      const distanceM = preview.distanceM;
      const durationS = preview.durationS;

      const trip = dbApi.createTrip(db, {
        driverId,
        driverName: driver.name,
        routeName: req.body?.routeName || 'Custom trip',
        vehicleLabel: req.body?.vehicle || 'Demo Hatchback',
        origin,
        destination,
        departureAt,
        seats,
        geometry,
        distanceM,
        durationS,
      });
      return res.status(201).json({ trip });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/v1/trips/:id', (req, res) => {
    const trip = dbApi.getTrip(db, req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    return res.json({ trip });
  });

  app.post('/v1/trips/:id/bookings', (req, res, next) => {
    try {
      const trip = dbApi.getTrip(db, req.params.id);
      if (!trip) {
        return res.status(404).json({ error: 'Trip not found' });
      }
      const pickup = assertLngLat(req.body?.pickup, 'pickup');
      const drop = assertLngLat(req.body?.drop, 'drop');
      const riderId = req.body?.riderId || 'u_rider';
      const maxWalkMeters = clampWalkMeters(req.body?.maxWalkMeters);
      const result = findMatchingRides(
        [{
          tripId: trip.id,
          driverName: trip.driverName,
          routeName: trip.routeName,
          vehicle: trip.vehicle,
          departureAt: trip.departureAt,
          availableSeats: trip.seatsLeft,
          geometry: trip.geometry,
        }],
        pickup,
        drop,
        { maxWalkMeters }
      );
      if (result.length === 0) {
        const error = new Error('This trip no longer matches the pickup and drop');
        error.statusCode = 400;
        throw error;
      }
      const match = result[0];
      const booking = dbApi.createBooking(db, {
        tripId: trip.id,
        riderId,
        pickup,
        drop,
        walkPickupM: match.matchDetails.pickupWalkDistanceMeters,
        walkDropM: match.matchDetails.dropWalkDistanceMeters,
      });
      return res.status(201).json({
        booking: {
          id: booking.id,
          tripId: booking.trip_id,
          riderId: booking.rider_id,
          status: booking.status,
          walkPickupM: booking.walk_pickup_m,
          walkDropM: booking.walk_drop_m,
        },
        trip: dbApi.getTrip(db, trip.id),
        match,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/v1/bookings/:id/cancel', (req, res, next) => {
    try {
      const booking = dbApi.cancelBooking(db, req.params.id);
      return res.json({
        booking: {
          id: booking.id,
          tripId: booking.trip_id,
          riderId: booking.rider_id,
          status: booking.status,
        },
        trip: dbApi.getTrip(db, booking.trip_id),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.use((err, _req, res, _next) => {
    const status = err.statusCode || 500;
    if (status >= 500) {
      console.error(err);
    }
    res.status(status).json({ error: err.message || 'Server error' });
  });

  return { app, db };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3001);
  createApp()
    .then(({ app }) => {
      app.listen(port, () => {
        console.log(`API listening on http://localhost:${port}`);
      });
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { createApp };
