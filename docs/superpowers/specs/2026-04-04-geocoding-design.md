# Place Geocoding via Nominatim

## Summary

Batch-geocode places in the database using the free OpenStreetMap Nominatim API. Triggered from the PlacesPage toolbar, runs in the background with toast progress, and saves results automatically.

## Scope

Places eligible for geocoding: missing `latitude` AND `longitude`, and have a non-empty `type` (untyped places are unsorted GEDCOM fragments).

## UX Flow

1. User clicks **"Geocode"** button in PlacesPage toolbar (alongside existing Add/Organize/Export/Import buttons).
2. Button label changes to **"Stop Geocoding"** while the process runs.
3. A persistent toast shows progress: "Geocoding 3/47..."
4. Each successful result is saved immediately via `places.update(id, { latitude, longitude })`.
5. On completion, summary toast: "Geocoded 42/47 places, 5 not found".
6. If the user clicks "Stop Geocoding", the process cancels gracefully and a summary toast shows what was completed so far.
7. If PlacesPage is still open when the process finishes, it refreshes.

### Edge cases

- All places already have coordinates: toast "All places already geocoded".
- No typed places exist: toast "No places to geocode".
- Network errors on individual places: skip, count as "not found", continue.

## Nominatim API

- Endpoint: `https://nominatim.openstreetmap.org/search?q={query}&format=json&limit=1`
- Query string: full hierarchical name built from `places.hierarchy(id)`, reversed and joined with ", " (e.g. "Rathmines, Dublin, Leinster, Ireland").
- Rate limit: 1 request per second — enforced with a ~1.1s delay between requests.
- Required header: `User-Agent: FamilyHub/0.2.0`
- Response: array of results; we take `[0].lat` and `[0].lon` (strings, parse to floats).

## Code Changes

### New file: `src/util/geocode.js`

Exports a single function:

```js
/**
 * @param {Object} opts
 * @param {Function} opts.getPlaces - async () => Place[] — returns all places
 * @param {Function} opts.getHierarchy - async (id) => Place[] — returns ancestor chain
 * @param {Function} opts.updatePlace - async (id, fields) => void
 * @param {Function} opts.onProgress - (current, total) => void
 * @param {AbortSignal} opts.signal - AbortController signal for cancellation
 * @returns {Promise<{ geocoded: number, notFound: number, total: number }>}
 */
export async function geocodePlaces(opts)
```

Logic:
1. Call `getPlaces()`, filter to places where `latitude == null && longitude == null && type !== ''`.
2. If none eligible, return early with `{ geocoded: 0, notFound: 0, total: 0 }`.
3. For each place:
   a. Check `signal.aborted` — if so, break.
   b. Build query from `getHierarchy(place.id)` — map to names, join with ", ".
   c. Fetch Nominatim with the query and User-Agent header.
   d. If result found, call `updatePlace(id, { latitude: parseFloat(lat), longitude: parseFloat(lon) })`.
   e. Call `onProgress(current, total)`.
   f. Wait 1100ms before next request.
4. Return summary counts.

### Modified: `src/lib/components/PlacesPage.svelte`

- Add `geocoding` state flag (boolean).
- Add `abortController` variable.
- Add "Geocode" / "Stop Geocoding" button in the toolbar.
- On click:
  - If not geocoding: set flag, create AbortController, call `geocodePlaces(...)` with `onProgress` updating a toast, then show summary toast and reset flag.
  - If geocoding: call `abortController.abort()`.
- On completion or abort: call `loadData()` to refresh the tree if modal is still open.

## Testing

`geocode.js` is pure async logic with injected dependencies — testable with mocked functions. However, since the core logic is a simple fetch loop, manual testing against Nominatim is sufficient for now. No new test file needed.
