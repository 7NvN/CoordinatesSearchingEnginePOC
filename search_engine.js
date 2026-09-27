const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { findMatchingRides } = require('./src/matcher');
const { openDb, listSearchTrips } = require('./src/db');

const pickup_lng = 78.34588;
const pickup_lat = 17.450918;
const drop_lng = 78.3691652;
const drop_lat = 17.4342597;

const riderPickup = [pickup_lng, pickup_lat];
const riderDrop = [drop_lng, drop_lat];

if (require.main === module) {
  const configuredPath = process.env.DB_PATH || './data/app.sqlite';
  const dbPath = path.isAbsolute(configuredPath)
    ? configuredPath
    : path.resolve(__dirname, configuredPath);
  const db = openDb(dbPath);
  try {
    const driverRoutes = listSearchTrips(db);
    console.log(`=== Searching for rides matching pickup [${riderPickup}] -> drop [${riderDrop}] ===\n`);
    const results = findMatchingRides(driverRoutes, riderPickup, riderDrop, { maxWalkMeters: 500 });
    if (results.length === 0) {
      console.log('No matching OSRM-backed driver routes found. Run npm run db:reset for demo data.');
    } else {
      console.log(`Found ${results.length} matching ride(s):\n`);
      console.log(JSON.stringify(results, null, 2));
    }
  } finally {
    db.close();
  }
}

module.exports = { findMatchingRides };
