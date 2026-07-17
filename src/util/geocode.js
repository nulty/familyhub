const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Sinsear/0.2.0';
const DELAY_MS = 1100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize a raw Nominatim result into the shape the rest of the app expects
 * (numeric lat/lon, plus the fields decomposition reads: address/name/class/addresstype).
 */
export function normalizeResult(r) {
  return {
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    display_name: r.display_name,
    address: r.address,
    importance: r.importance,
    addresstype: r.addresstype,
    name: r.name,
    class: r.class,
    type: r.type,
  };
}

/**
 * Run a single Nominatim search and return normalized results.
 *
 * Used by the inline place-creation flow (search → pick → decompose) and the
 * review screen's retry. Returns [] for an empty query or a failed request.
 *
 * @param {string} query
 * @param {Object} [opts]
 * @param {number} [opts.limit=5]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Array>} normalized results
 */
export async function geocodeSearch(query, { limit = 5, signal } = {}) {
  const q = (query || '').trim();
  if (!q) return [];
  const url = `${NOMINATIM_URL}?${new URLSearchParams({
    q, format: 'json', limit: String(limit), addressdetails: '1',
  })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(normalizeResult);
}

/**
 * Reverse-geocode a coordinate pair into a single normalized result, or null.
 *
 * Used by the map-pick flow: the user pointed at an exact spot, so the caller
 * should keep the picked coordinates and use this result only for the address
 * hierarchy. Nominatim's /reverse (jsonv2) uses `category` where /search uses
 * `class` — mapped here so decomposition sees a uniform shape.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {Object} [opts]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<Object|null>} normalized result
 */
export async function reverseGeocode(lat, lon, { signal } = {}) {
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  const url = `https://nominatim.openstreetmap.org/reverse?${new URLSearchParams({
    lat: String(lat), lon: String(lon), format: 'jsonv2', addressdetails: '1',
  })}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data || data.error || !data.address) return null;
  return normalizeResult({ ...data, class: data.category ?? data.class });
}

/**
 * Batch-geocode places via Nominatim, returning results via onResult callback.
 *
 * Eligibility: places with no coordinates and not already in the queue.
 * Untyped places are eligible (the type filter from the original implementation
 * has been dropped — the new decomposition flow assigns types from results).
 *
 * @param {Object} opts
 * @param {Array} opts.places — all places (will be filtered to eligible)
 * @param {Function} opts.hasQueueEntry — (placeId) => boolean — skip if already queued
 * @param {Function} opts.onResult — (place, results) => void — called per place
 * @param {Function} opts.onProgress — (current, total) => void
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<{ fetched: number, noResults: number, total: number }>}
 */
export async function batchGeocode({ places, hasQueueEntry, onResult, onProgress, signal }) {
  const eligible = places.filter(
    (p) => p.latitude == null && p.longitude == null && !hasQueueEntry(p.id)
  );

  if (signal?.aborted) return { fetched: 0, noResults: 0, total: 0 };

  const total = eligible.length;
  if (total === 0) return { fetched: 0, noResults: 0, total: 0 };

  let fetched = 0;
  let noResults = 0;

  for (let i = 0; i < eligible.length; i++) {
    if (signal?.aborted) break;

    const place = eligible[i];
    try {
      const query = place.name;
      const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: query, format: 'json', limit: '3', addressdetails: '1' })}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal,
      });

      if (!res.ok) {
        onResult(place, []);
        noResults++;
      } else {
        const data = await res.json();
        onResult(place, data);
        if (data.length > 0) {
          fetched++;
        } else {
          noResults++;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') break;
      onResult(place, []);
      noResults++;
    }

    onProgress?.(i + 1, total);

    if (i < eligible.length - 1 && !signal?.aborted) {
      await delay(DELAY_MS);
    }
  }

  return { fetched, noResults, total };
}
