const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const dbApi = require('./db');
const { getRouteLineString } = require('./osrm');
const { findMatchingRides } = require('./matcher');

const root = path.join(__dirname, '..');
const configuredPath = process.env.DB_PATH || './data/app.sqlite';
const dbPath = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(root, configuredPath);
const seedTripsPath = path.join(root, 'data', 'seed-trips.json');

async function reset() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }

  const db = dbApi.openDb(dbPath);
  try {
    await dbApi.seedIfEmpty(db, seedTripsPath, getRouteLineString);
    const matches = findMatchingRides(
      dbApi.listSearchTrips(db),
      [78.34588, 17.450918],
      [78.3691652, 17.4342597],
      { maxWalkMeters: 500 }
    );
    if (matches.length === 0) {
      throw new Error('Reset failed readiness check: default search has no match');
    }
    console.log(`Database reset: ${dbPath}`);
    console.log(`Default search ready: ${matches[0].routeName}`);
  } finally {
    db.close();
  }
}

reset().catch((error) => {
  console.error(error);
  process.exit(1);
});
