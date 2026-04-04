# Place Geocoding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Batch-geocode all eligible places using the free Nominatim (OpenStreetMap) API, with progress toasts and a toggle button.

**Architecture:** New `src/util/geocode.js` module with dependency-injected async logic. PlacesPage gets a Geocode/Stop button. Toast store gets `updateToast` and `dismissToast` for persistent progress updates.

**Tech Stack:** Nominatim REST API, Svelte 5 runes, existing toast store (svelte/store)

---

### Task 1: Extend toast store with update and dismiss

The progress toast needs to persist and update its message ("Geocoding 3/47..."). The current store only supports fire-and-forget toasts. Add two small functions.

**Files:**
- Modify: `src/lib/shared/toast-store.js`
- Modify: `tests/toast.test.js`

- [ ] **Step 1: Write failing tests for updateToast and dismissToast**

Add to `tests/toast.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toasts, showToast, updateToast, dismissToast } from '../src/lib/shared/toast-store.js';
import { get } from 'svelte/store';

// ... existing tests above ...

describe('updateToast', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('updates the message of an existing toast', () => {
    const id = showToast('initial', 0);
    updateToast(id, 'updated');
    const list = get(toasts);
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe('updated');
    dismissToast(id);
  });

  it('does nothing if toast id does not exist', () => {
    const id = showToast('hello', 0);
    updateToast(999, 'nope');
    const list = get(toasts);
    expect(list[0].message).toBe('hello');
    dismissToast(id);
  });
});

describe('dismissToast', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('removes a toast by id', () => {
    const id = showToast('bye', 0);
    expect(get(toasts)).toHaveLength(1);
    dismissToast(id);
    expect(get(toasts)).toHaveLength(0);
  });
});

describe('persistent toast (duration = 0)', () => {
  beforeEach(() => {
    toasts.set([]);
  });

  it('does not auto-dismiss when duration is 0', () => {
    vi.useFakeTimers();
    const id = showToast('persistent', 0);
    vi.advanceTimersByTime(10000);
    expect(get(toasts)).toHaveLength(1);
    dismissToast(id);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/toast.test.js`
Expected: FAIL — `updateToast` and `dismissToast` are not exported, `showToast` doesn't return an id.

- [ ] **Step 3: Implement updateToast, dismissToast, and return id from showToast**

Replace the contents of `src/lib/shared/toast-store.js` with:

```js
import { writable } from 'svelte/store';

export const toasts = writable([]);

let nextId = 0;

export function showToast(message, duration = 3000) {
  const id = nextId++;
  toasts.update((t) => [...t, { id, message }]);
  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function updateToast(id, message) {
  toasts.update((t) => t.map((item) => item.id === id ? { ...item, message } : item));
}

export function dismissToast(id) {
  toasts.update((t) => t.filter((item) => item.id !== id));
}
```

Changes from original:
- `showToast` returns `id` (was void).
- `showToast` skips `setTimeout` when `duration` is `0` (persistent toast).
- New `updateToast(id, message)` — updates message in place.
- New `dismissToast(id)` — removes by id (extracted from the old setTimeout callback).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/toast.test.js`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/toast-store.js tests/toast.test.js
git commit -m "feat: add updateToast, dismissToast, and persistent toast support"
```

---

### Task 2: Create geocodePlaces utility

Pure async function with injected dependencies. No imports from the app — fully testable in isolation.

**Files:**
- Create: `src/util/geocode.js`

- [ ] **Step 1: Create `src/util/geocode.js`**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/util/geocode.js
git commit -m "feat: add geocodePlaces utility for Nominatim batch geocoding"
```

---

### Task 3: Add Geocode button to PlacesPage

Wire up the button, AbortController, progress toasts, and summary toast.

**Files:**
- Modify: `src/lib/components/PlacesPage.svelte`

- [ ] **Step 1: Add imports and state**

At the top of the `<script>` block in `PlacesPage.svelte`, add these imports alongside the existing ones:

```js
import { geocodePlaces } from '../../util/geocode.js';
import { showToast, updateToast, dismissToast } from '../shared/toast-store.js';
```

Remove the existing `showToast`-only import line:
```js
// REMOVE this line:
import { showToast } from '../shared/toast-store.js';
```

Add state variables after the existing `let collapsed = $state({});` line:

```js
let geocoding = $state(false);
let abortController = null;
```

- [ ] **Step 2: Add the geocode handler function**

Add this function inside the `<script>` block, after the `handleImport` function:

```js
async function handleGeocode() {
  if (geocoding) {
    abortController?.abort();
    return;
  }

  geocoding = true;
  abortController = new AbortController();
  const toastId = showToast('Starting geocoding...', 0);

  try {
    const result = await geocodePlaces({
      getPlaces: () => places.list(),
      getHierarchy: (id) => places.hierarchy(id),
      updatePlace: (id, fields) => places.update(id, fields),
      onProgress: (current, total) => {
        updateToast(toastId, `Geocoding ${current}/${total}...`);
      },
      signal: abortController.signal,
    });

    dismissToast(toastId);

    if (result.total === 0) {
      showToast('All places already geocoded');
    } else {
      const parts = [`Geocoded ${result.geocoded}/${result.total} places`];
      if (result.notFound > 0) parts.push(`${result.notFound} not found`);
      showToast(parts.join(', '));
    }

    await loadData();
  } catch (err) {
    dismissToast(toastId);
    if (err.name !== 'AbortError') {
      showToast('Geocoding error: ' + err.message);
    }
  } finally {
    geocoding = false;
    abortController = null;
  }
}
```

- [ ] **Step 3: Add the button to the toolbar**

In the template, find the toolbar `<div>` with the existing buttons:

```html
<div style="display:flex;gap:8px;margin-bottom:12px">
```

Add the Geocode button after the Import button:

```html
<button class="btn btn-sm" onclick={handleGeocode}>
  {geocoding ? 'Stop Geocoding' : 'Geocode'}
</button>
```

- [ ] **Step 4: Manual test**

Run: `npm run dev`

1. Open the app, go to Places.
2. Verify "Geocode" button appears in the toolbar.
3. Click it — should show progress toast updating, button says "Stop Geocoding".
4. Click "Stop Geocoding" — should cancel and show summary.
5. Run again — places already geocoded should be skipped.
6. Verify lat/lng values saved by editing a geocoded place.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/PlacesPage.svelte
git commit -m "feat: add geocode button to PlacesPage with progress and cancellation"
```

---

### Task 4: Run full test suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All existing tests pass (164+). No regressions.

- [ ] **Step 2: Final commit if any fixups needed**
