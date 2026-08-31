const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

// 1. Load the mock JSON route database
const routesDbPath = path.join(__dirname, 'routes_db.json');
const driverRoutes = JSON.parse(fs.readFileSync(routesDbPath, 'utf8'));

/**
 * Searches and ranks matching driver routes for a rider request
 * @param {Array<number>} riderPickup - [longitude, latitude]
 * @param {Array<number>} riderDrop - [longitude, latitude]
 * @param {number} maxWalkDistanceMeters - Max walking threshold (default 500m)
 */
function findMatchingRides(riderPickup, riderDrop, maxWalkDistanceMeters = 500) {
  const pickupPoint = turf.point(riderPickup);
  const dropPoint = turf.point(riderDrop);
  const matches = [];

  for (const route of driverRoutes) {
    const line = turf.lineString(route.geometry.coordinates);

    // 1. Snap pickup and drop points to the route
    const nearestPickup = turf.nearestPointOnLine(line, pickupPoint, { units: 'meters' });
    const nearestDrop = turf.nearestPointOnLine(line, dropPoint, { units: 'meters' });

    const pickupDist = nearestPickup.properties.dist;
    const dropDist = nearestDrop.properties.dist;
    const pickupProgress = nearestPickup.properties.location;
    const dropProgress = nearestDrop.properties.location;

    // Check A: Distance thresholds
    if (pickupDist > maxWalkDistanceMeters || dropDist > maxWalkDistanceMeters) {
      continue; // Skip - too far off path
    }

    // Check B: Directionality (pickup must happen before drop)
    if (pickupProgress >= dropProgress) {
      continue; // Skip - wrong direction
    }

    // Check C: Seats available
    if (route.availableSeats <= 0) {
      continue; // Skip - no seats
    }

    // Calculate shared route distance
    const sharedSegment = turf.lineSlice(nearestPickup, nearestDrop, line);
    const sharedKm = turf.length(sharedSegment, { units: 'kilometers' });

    matches.push({
      routeId: route.routeId,
      driverName: route.driverName,
      routeName: route.routeName,
      vehicle: route.vehicle,
      departureTime: route.departureTime,
      availableSeats: route.availableSeats,
      matchDetails: {
        pickupWalkDistanceMeters: Math.round(pickupDist),
        dropWalkDistanceMeters: Math.round(dropDist),
        totalDetourMeters: Math.round(pickupDist + dropDist),
        sharedRideDistanceKm: Number(sharedKm.toFixed(2))
      }
    });
  }

  // Rank by smallest total detour distance
  matches.sort((a, b) => a.matchDetails.totalDetourMeters - b.matchDetails.totalDetourMeters);

  return matches;
}

// ==========================================
// --- RUN OFFLINE SEARCH TESTS ---
// ==========================================

// Rider request: Pickup near Divyasree Orion -> Drop near Gachibowli junction
const pickup_lng = 78.34588
const pickup_lat = 17.450918

const drop_lng = 78.3691652
const drop_lat = 17.4342597

const riderPickup = [pickup_lng, pickup_lat];
const riderDrop = [drop_lng, drop_lat];

console.log(`=== Searching for rides matching pickup [${riderPickup}] -> drop [${riderDrop}] ===\n`);

const results = findMatchingRides(riderPickup, riderDrop, 500);

if (results.length === 0) {
  console.log("No matching driver routes found.");
} else {
  console.log(`Found ${results.length} matching ride(s):\n`);
  console.log(JSON.stringify(results, null, 2));
}