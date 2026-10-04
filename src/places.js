const cache = new Map();

function cacheKey(lng, lat) {
  return `${Number(lng).toFixed(4)},${Number(lat).toFixed(4)}`;
}

function shortName(data) {
  const address = data.address || {};
  const parts = [
    address.amenity,
    address.building,
    address.neighbourhood,
    address.suburb,
    address.city || address.town || address.village,
  ].filter(Boolean);
  if (parts.length > 0) return [...new Set(parts)].slice(0, 3).join(', ');
  return String(data.display_name || 'Unnamed place').split(',').slice(0, 3).join(',').trim();
}

async function reversePlace(lng, lat) {
  const key = cacheKey(lng, lat);
  if (cache.has(key)) return cache.get(key);

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'CoordinatesSearchingEnginePOC/1.1 (local carpool demo)',
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Place lookup responded with status ${response.status}`);
    }
    const data = await response.json();
    const place = { name: shortName(data), lng, lat };
    cache.set(key, place);
    return place;
  } catch (error) {
    const place = {
      name: 'Unnamed place',
      lng,
      lat,
      error: error.name === 'AbortError' ? 'Place lookup timed out' : error.message,
    };
    return place;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { reversePlace };
