const turf = require('@turf/turf');
const { paddedBbox, pointInBbox } = require('./coords');

function tripSeats(trip) {
  if (trip.availableSeats != null) return Number(trip.availableSeats);
  if (trip.seats_left != null) return Number(trip.seats_left);
  return 0;
}

function tripId(trip) {
  return trip.tripId || trip.routeId || trip.id;
}

function tripCoordinates(trip) {
  return trip.geometry?.coordinates || trip.coordinates || [];
}

function inDepartureWindow(trip, departAfter, departBefore) {
  if (!departAfter && !departBefore) return true;
  const raw = trip.departureAt || trip.departure_at;
  if (!raw) return true;
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) return true;
  if (departAfter && when < new Date(departAfter)) return false;
  if (departBefore && when > new Date(departBefore)) return false;
  return true;
}

function findMatchingRides(trips, riderPickup, riderDrop, options = {}) {
  const maxWalkDistanceMeters = options.maxWalkMeters ?? 500;
  const debug = Boolean(options.debug);
  const pickupPoint = turf.point(riderPickup);
  const dropPoint = turf.point(riderDrop);
  const matches = [];
  const skipped = [];

  for (const trip of trips) {
    const id = tripId(trip);
    const coords = tripCoordinates(trip);

    if (!coords || coords.length < 2) {
      if (debug) skipped.push({ tripId: id, reason: 'invalid_geometry' });
      continue;
    }

    if (!inDepartureWindow(trip, options.departAfter, options.departBefore)) {
      if (debug) skipped.push({ tripId: id, reason: 'time' });
      continue;
    }

    const seats = tripSeats(trip);
    if (seats <= 0) {
      if (debug) skipped.push({ tripId: id, reason: 'no_seats' });
      continue;
    }

    const bbox = paddedBbox(coords, maxWalkDistanceMeters);
    if (!pointInBbox(riderPickup, bbox) || !pointInBbox(riderDrop, bbox)) {
      if (debug) skipped.push({ tripId: id, reason: 'too_far' });
      continue;
    }

    const line = turf.lineString(coords);
    const nearestPickup = turf.nearestPointOnLine(line, pickupPoint, { units: 'meters' });
    const nearestDrop = turf.nearestPointOnLine(line, dropPoint, { units: 'meters' });

    const pickupDist = nearestPickup.properties.dist;
    const dropDist = nearestDrop.properties.dist;
    const pickupProgress = nearestPickup.properties.location;
    const dropProgress = nearestDrop.properties.location;

    if (pickupDist > maxWalkDistanceMeters || dropDist > maxWalkDistanceMeters) {
      if (debug) skipped.push({ tripId: id, reason: 'too_far' });
      continue;
    }

    if (pickupProgress >= dropProgress) {
      if (debug) skipped.push({ tripId: id, reason: 'wrong_direction' });
      continue;
    }

    const sharedSegment = turf.lineSlice(nearestPickup, nearestDrop, line);
    const sharedKm = turf.length(sharedSegment, { units: 'kilometers' });
    const [boardLng, boardLat] = nearestPickup.geometry.coordinates;
    const [alightLng, alightLat] = nearestDrop.geometry.coordinates;

    matches.push({
      tripId: id,
      driverName: trip.driverName || trip.driver_name,
      routeName: trip.routeName || trip.route_name,
      vehicle: trip.vehicle || trip.vehicle_label,
      departureTime: trip.departureTime || trip.departure_at,
      availableSeats: seats,
      matchDetails: {
        pickupWalkDistanceMeters: Math.round(pickupDist),
        dropWalkDistanceMeters: Math.round(dropDist),
        totalDetourMeters: Math.round(pickupDist + dropDist),
        sharedRideDistanceKm: Number(sharedKm.toFixed(2)),
      },
      board: { lng: boardLng, lat: boardLat },
      alight: { lng: alightLng, lat: alightLat },
    });
  }

  matches.sort((a, b) => a.matchDetails.totalDetourMeters - b.matchDetails.totalDetourMeters);

  if (debug) {
    return { matches, skipped };
  }
  return matches;
}

module.exports = { findMatchingRides };
