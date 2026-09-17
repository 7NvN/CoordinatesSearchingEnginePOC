const fs = require('fs');
const path = require('path');
const { findMatchingRides } = require('./src/matcher');

const routesDbPath = path.join(__dirname, 'routes_db.json');
const driverRoutes = JSON.parse(fs.readFileSync(routesDbPath, 'utf8'));

const pickup_lng = 78.34588;
const pickup_lat = 17.450918;
const drop_lng = 78.3691652;
const drop_lat = 17.4342597;

const riderPickup = [pickup_lng, pickup_lat];
const riderDrop = [drop_lng, drop_lat];

if (require.main === module) {
  console.log(`=== Searching for rides matching pickup [${riderPickup}] -> drop [${riderDrop}] ===\n`);
  const results = findMatchingRides(driverRoutes, riderPickup, riderDrop, { maxWalkMeters: 500 });
  if (results.length === 0) {
    console.log('No matching driver routes found.');
  } else {
    console.log(`Found ${results.length} matching ride(s):\n`);
    console.log(JSON.stringify(results, null, 2));
  }
}

module.exports = { findMatchingRides };
