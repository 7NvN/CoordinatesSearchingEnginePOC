const cache = new Map();
const MAX_CACHE = 200;

function roundCoord(value) {
  return Number(value).toFixed(3);
}

function cacheKey(baseUrl, origin, destination) {
  return `${baseUrl}|${roundCoord(origin.lng)},${roundCoord(origin.lat)};${roundCoord(destination.lng)},${roundCoord(destination.lat)}`;
}

function remember(key, value) {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
  cache.set(key, value);
}

async function getRouteLineString(origin, destination, options = {}) {
  const baseUrl = options.baseUrl || process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
  const timeoutMs = Number(options.timeoutMs || process.env.OSRM_TIMEOUT_MS || 8000);
  const key = cacheKey(baseUrl, origin, destination);
  if (!options.skipCache && cache.has(key)) {
    return { ...cache.get(key), cached: true };
  }

  const coordinatesParam = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinatesParam}?overview=full&geometries=geojson`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'CoordinatesSearchingEnginePOC/1.1' },
    });
    if (!response.ok) {
      throw new Error(`OSRM API responded with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No driving route found between the specified coordinates.');
    }

    const bestRoute = data.routes[0];
    const result = {
      success: true,
      summary: {
        distanceKm: (bestRoute.distance / 1000).toFixed(2),
        durationMins: (bestRoute.duration / 60).toFixed(1),
      },
      distanceM: bestRoute.distance,
      durationS: bestRoute.duration,
      lineString: bestRoute.geometry,
    };
    if (!options.skipCache) {
      remember(key, result);
    }
    return { ...result, cached: false };
  } catch (error) {
    return {
      success: false,
      error: error.name === 'AbortError'
        ? `OSRM request timed out after ${timeoutMs}ms`
        : error.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkOsrmHealth(baseUrl) {
  const origin = { lng: 78.356, lat: 17.451 };
  const destination = { lng: 78.348, lat: 17.44 };
  const result = await getRouteLineString(origin, destination, { baseUrl, skipCache: true });
  if (result.success) {
    return { ok: true, provider: 'osrm-driving' };
  }
  return { ok: false, error: result.error };
}

module.exports = { getRouteLineString, checkOsrmHealth };
