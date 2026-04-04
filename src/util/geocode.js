const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'FamilyHub/0.2.0';
const DELAY_MS = 1100;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch-geocode places missing lat/lng using Nominatim.
 *
 * @param {Object} opts
 * @param {Function} opts.getPlaces    - async () => Place[]
 * @param {Function} opts.getHierarchy - async (id) => Place[] (root-first array)
 * @param {Function} opts.updatePlace  - async (id, { latitude, longitude }) => void
 * @param {Function} opts.onProgress   - (current, total) => void
 * @param {AbortSignal} opts.signal    - AbortController signal for cancellation
 * @returns {Promise<{ geocoded: number, notFound: number, total: number }>}
 */
export async function geocodePlaces({ getPlaces, getHierarchy, updatePlace, onProgress, signal }) {
  const allPlaces = await getPlaces();
  const eligible = allPlaces.filter(
    (p) => p.latitude == null && p.longitude == null && p.type !== ''
  );

  const total = eligible.length;
  if (total === 0) return { geocoded: 0, notFound: 0, total: 0 };

  let geocoded = 0;
  let notFound = 0;

  for (let i = 0; i < eligible.length; i++) {
    if (signal?.aborted) break;

    const place = eligible[i];
    try {
      const chain = await getHierarchy(place.id);
      const query = chain.map((p) => p.name).reverse().join(', ');
      const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: query, format: 'json', limit: '1' })}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal,
      });

      if (!res.ok) {
        notFound++;
      } else {
        const data = await res.json();
        if (data.length > 0) {
          const { lat, lon } = data[0];
          await updatePlace(place.id, {
            latitude: parseFloat(lat),
            longitude: parseFloat(lon),
          });
          geocoded++;
        } else {
          notFound++;
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') break;
      notFound++;
    }

    onProgress?.(i + 1, total);

    // Rate limit: wait before next request (skip delay after last item)
    if (i < eligible.length - 1 && !signal?.aborted) {
      await delay(DELAY_MS);
    }
  }

  return { geocoded, notFound, total };
}
