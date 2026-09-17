const { getRouteLineString } = require('./src/osrm');

async function run() {
  const origin = { lat: 17.4375, lng: 78.3773 };
  const destination = { lat: 17.4699, lng: 78.3578 };

  console.log('Fetching route from Divyasree Orion to Kondapur...\n');
  const result = await getRouteLineString(origin, destination);

  if (result.success) {
    console.log('=== Route Summary ===');
    console.log(`Distance : ${result.summary.distanceKm} km`);
    console.log(`Duration : ${result.summary.durationMins} minutes`);
    console.log(`Waypoints: ${result.lineString.coordinates.length} coordinate points along the road\n`);
    console.log('=== GeoJSON LineString (First 5 and Last 2 Points) ===');
    console.log({
      type: result.lineString.type,
      sampleCoordinates: [
        ...result.lineString.coordinates.slice(0, 5),
        '...',
        ...result.lineString.coordinates.slice(-2),
      ],
    });
  } else {
    console.error('Failed:', result.error);
  }
}

if (require.main === module) {
  run();
}

module.exports = { getRouteLineString };
