const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'Sinsear/0.2.0';
const DELAY_MS = 1100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
