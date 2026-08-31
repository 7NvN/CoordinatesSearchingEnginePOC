/**
 * Fetches driving route LineString between two coordinates using OSRM
 * @param {Object} origin - { lat: number, lng: number }
 * @param {Object} destination - { lat: number, lng: number }
 * @returns {Promise<Object>} GeoJSON LineString, distance, and duration
 */
async function getRouteLineString(origin, destination) {
  // OSRM expects coordinates in "longitude,latitude" format
  const coordinatesParam = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  
  // geometries=geojson returns standard GeoJSON coordinates array
  // overview=full returns high-resolution road path
  const url = `https://router.project-osrm.org/route/v1/driving/${coordinatesParam}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`OSRM API responded with status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error("No driving route found between the specified coordinates.");
    }

    const bestRoute = data.routes[0];

    return {
      success: true,
      summary: {
        distanceKm: (bestRoute.distance / 1000).toFixed(2), // converted from meters
        durationMins: (bestRoute.duration / 60).toFixed(1), // converted from seconds
      },
      // Standard GeoJSON LineString format:
      // { type: "LineString", coordinates: [[lng, lat], [lng, lat], ...] }
      lineString: bestRoute.geometry,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

// ==========================================
// --- RUN THE POC WITH HYDERABAD POINTS ---
// ==========================================
async function run() {
  // 1. Origin: Divyasree Orion, Hyderabad
  const origin = { lat: 17.4375, lng: 78.3773 };

  // 2. Destination: Kondapur, Hyderabad
  const destination = { lat: 17.4699, lng: 78.3578 };

  console.log("Fetching route from Divyasree Orion to Kondapur...\n");
  const result = await getRouteLineString(origin, destination);

  if (result.success) {
    console.log("=== Route Summary ===");
    console.log(`Distance : ${result.summary.distanceKm} km`);
    console.log(`Duration : ${result.summary.durationMins} minutes`);
    console.log(`Waypoints: ${result.lineString.coordinates.length} coordinate points along the road\n`);

    console.log("=== GeoJSON LineString (First 5 and Last 2 Points) ===");
    console.log({
      type: result.lineString.type,
      sampleCoordinates: [
        ...result.lineString.coordinates.slice(0, 5),
        "...",
        ...result.lineString.coordinates.slice(-2),
      ],
    });
  } else {
    console.error("Failed:", result.error);
  }
}

run();