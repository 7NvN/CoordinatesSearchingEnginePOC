const MAX_WALK_CAP_METERS = 2000;
const DEFAULT_WALK_METERS = 500;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function asLngLat(input) {
  if (Array.isArray(input) && input.length >= 2) {
    const lng = Number(input[0]);
    const lat = Number(input[1]);
    if (isFiniteNumber(lng) && isFiniteNumber(lat)) {
      return [lng, lat];
    }
  }

  if (input && typeof input === 'object') {
    const lng = Number(input.lng ?? input.lon ?? input.longitude);
    const lat = Number(input.lat ?? input.latitude);
    if (isFiniteNumber(lng) && isFiniteNumber(lat)) {
      return [lng, lat];
    }
  }

  return null;
}

function assertLngLat(input, fieldName) {
  const point = asLngLat(input);
  if (!point) {
    const error = new Error(`Invalid ${fieldName}: expected { lat, lng } or [lng, lat]`);
    error.statusCode = 400;
    throw error;
  }
  const [lng, lat] = point;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
    const error = new Error(`Invalid ${fieldName}: coordinates out of range`);
    error.statusCode = 400;
    throw error;
  }
  return point;
}

function clampWalkMeters(value) {
  const walk = value == null ? DEFAULT_WALK_METERS : Number(value);
  if (!isFiniteNumber(walk) || walk <= 0) {
    const error = new Error('maxWalkMeters must be a positive number');
    error.statusCode = 400;
    throw error;
  }
  return Math.min(walk, MAX_WALK_CAP_METERS);
}

function paddedBbox(coords, padMeters) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coords) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  const midLat = (minLat + maxLat) / 2;
  const padLat = padMeters / 111000;
  const padLng = padMeters / (111000 * Math.max(0.2, Math.cos((midLat * Math.PI) / 180)));
  return [minLng - padLng, minLat - padLat, maxLng + padLng, maxLat + padLat];
}

function pointInBbox(point, bbox) {
  return point[0] >= bbox[0] && point[1] >= bbox[1] && point[0] <= bbox[2] && point[1] <= bbox[3];
}

function toIsoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

module.exports = {
  MAX_WALK_CAP_METERS,
  DEFAULT_WALK_METERS,
  asLngLat,
  assertLngLat,
  clampWalkMeters,
  paddedBbox,
  pointInBbox,
  toIsoOrNull,
};
