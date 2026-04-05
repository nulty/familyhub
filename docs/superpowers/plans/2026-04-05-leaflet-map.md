# Leaflet Map View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a map view to FamilyHub that plots geocoded event locations for selected people using Leaflet, with a TomSelect person picker in a dedicated map panel.

**Architecture:** New `src/ui/map.js` Leaflet wrapper (vanilla JS, same pattern as `src/ui/tree.js`). New `MapPanel.svelte` component with TomSelect multi-select picker and event list. `App.svelte` gets a Tree/Map view toggle. Map and chart are sibling containers — one hidden while the other is shown.

**Tech Stack:** Leaflet, TomSelect, Svelte 5 runes, existing SQLite DB facade

---

## File Structure

| File | Role |
|------|------|
| **Create:** `src/ui/map.js` | Leaflet wrapper — init, markers, popups, zoom |
| **Create:** `src/lib/components/MapPanel.svelte` | Map side panel — TomSelect picker, selected people list, event rows |
| **Modify:** `src/lib/components/App.svelte` | View toggle state, render map container, swap panel content |
| **Modify:** `src/styles.css` | Map container, view toggle, map panel styles |

---

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install leaflet and tom-select**

```bash
npm install leaflet tom-select
```

- [ ] **Step 2: Verify installation**

```bash
node -e "require('leaflet'); console.log('leaflet OK')"
node -e "require('tom-select'); console.log('tom-select OK')"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add leaflet and tom-select dependencies"
```

---

### Task 2: Create map.js — Leaflet wrapper

Vanilla JS module that manages the Leaflet map instance, markers, and popups. Follows the same module-level singleton pattern as `src/ui/tree.js`.

**Files:**
- Create: `src/ui/map.js`

- [ ] **Step 1: Create `src/ui/map.js`**

```js
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

let map = null;
// personId -> { color, layers: Map<eventId, circleMarker> }
const personMarkers = new Map();

const DEFAULT_CENTER = [53.4, -8.0];
const DEFAULT_ZOOM = 7;

/**
 * Initialize the Leaflet map in the given container element.
 * If already initialized, just invalidate size (handles show/hide).
 */
export function initMap(container) {
  if (map) {
    map.invalidateSize();
    return;
  }
  map = L.map(container, { zoomControl: true }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(map);
}

/**
 * Add markers for a person's geocoded events.
 * @param {string} personId
 * @param {string} color — hex color for the markers
 * @param {Array<{eventId, lat, lng, type, date, place, personName}>} events
 */
export function addMarkers(personId, color, events) {
  removeMarkers(personId);
  const layers = new Map();

  for (const ev of events) {
    const marker = L.circleMarker([ev.lat, ev.lng], {
      radius: 8,
      color: '#fff',
      weight: 2,
      fillColor: color,
      fillOpacity: 0.9,
    }).addTo(map);

    const popupHtml = `<div style="font-size:13px;line-height:1.4">
      <div style="font-weight:600">${ev.type}</div>
      ${ev.date ? `<div>${ev.date}</div>` : ''}
      <div style="color:#666">${ev.personName}</div>
    </div>`;
    marker.bindPopup(popupHtml);

    layers.set(ev.eventId, marker);
  }

  personMarkers.set(personId, { color, layers });
}

/**
 * Remove all markers for a person.
 */
export function removeMarkers(personId) {
  const entry = personMarkers.get(personId);
  if (!entry) return;
  for (const marker of entry.layers.values()) {
    marker.remove();
  }
  personMarkers.delete(personId);
}

/**
 * Remove all markers from the map.
 */
export function clearAllMarkers() {
  for (const personId of [...personMarkers.keys()]) {
    removeMarkers(personId);
  }
}

/**
 * Zoom to a specific event marker and open its popup.
 */
export function zoomToMarker(personId, eventId) {
  const entry = personMarkers.get(personId);
  if (!entry) return;
  const marker = entry.layers.get(eventId);
  if (!marker) return;
  const latlng = marker.getLatLng();
  map.setView(latlng, 14);
  marker.openPopup();
}

/**
 * Fit the map bounds to show all visible markers.
 */
export function fitBounds() {
  const allLatLngs = [];
  for (const entry of personMarkers.values()) {
    for (const marker of entry.layers.values()) {
      allLatLngs.push(marker.getLatLng());
    }
  }
  if (allLatLngs.length === 0) {
    map?.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    return;
  }
  if (allLatLngs.length === 1) {
    map.setView(allLatLngs[0], 12);
    return;
  }
  map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40] });
}

/**
 * Call when the map container becomes visible to fix tile rendering.
 */
export function invalidateSize() {
  map?.invalidateSize();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/map.js
git commit -m "feat: add Leaflet map wrapper module"
```

---

### Task 3: Add map container and view toggle styles

Add the CSS for the map container (hidden by default, fills main area) and the Tree/Map toggle buttons.

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add map container styles after the `#chart-container` section (after line ~298)**

Find the line `.hidden { display: none !important; }` (line 394 in styles.css). Add the new styles just before it:

```css
/* ── Map ──────────────────────────────────────────────────────────────────── */

#map-container {
  position: relative;
  overflow: hidden;
  display: none;
}

#main.map-active #map-container { display: block; }
#main.map-active #chart-container { display: none; }

/* ── View Toggle ──────────────────────────────────────────────────────────── */

.view-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.view-toggle button {
  padding: 4px 12px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background .15s, color .15s;
}

.view-toggle button:hover {
  background: #f0f0f0;
}

.view-toggle button.active {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 2: Add map panel styles**

Add after the map container styles:

```css
/* ── Map Panel ────────────────────────────────────────────────────────────── */

.map-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.map-panel-picker {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

.map-panel-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
}

.map-person {
  margin-bottom: 16px;
}

.map-person-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.map-person-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.map-person-name {
  font-weight: 500;
}

.map-person-years {
  color: var(--text-muted);
  font-size: 12px;
}

.map-event-row {
  padding: 3px 0 3px 18px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  gap: 6px;
}

.map-event-row:hover {
  color: var(--accent);
}

.map-panel-footer {
  padding: 8px 12px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-muted);
}

.map-no-events {
  padding: 3px 0 3px 18px;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add map container and view toggle styles"
```

---

### Task 4: Create MapPanel.svelte

The map side panel with TomSelect person picker, selected people list with events, and footer.

**Files:**
- Create: `src/lib/components/MapPanel.svelte`

- [ ] **Step 1: Create `src/lib/components/MapPanel.svelte`**

```svelte
<script>
  import { onMount } from 'svelte';
  import TomSelect from 'tom-select';
  import 'tom-select/dist/css/tom-select.css';
  import { people, places } from '../../db/db.js';
  import { addMarkers, removeMarkers, zoomToMarker, fitBounds } from '../../ui/map.js';

  const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393'];

  let selectEl;
  let tomSelect;

  // { personId: { person, color, events: [{eventId, lat, lng, type, date, place, personName}] } }
  let selected = $state({});

  // Synchronous color map — shared between TomSelect render and addPerson
  // TomSelect's render.item fires before onItemAdd, so color must be assigned in render
  const colorMap = new Map();
  function getColor(personId) {
    if (!colorMap.has(personId)) {
      colorMap.set(personId, COLORS[colorMap.size % COLORS.length]);
    }
    return colorMap.get(personId);
  }

  // Cache place lookups to avoid repeated fetches
  const placeCache = new Map();

  async function getPlace(placeId) {
    if (placeCache.has(placeId)) return placeCache.get(placeId);
    const p = await places.get(placeId);
    placeCache.set(placeId, p);
    return p;
  }

  function formatName(person) {
    return [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  }

  function extractYear(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/\b(\d{4})\b/);
    return m ? m[1] : '';
  }

  async function addPerson(personId) {
    if (selected[personId]) return;

    const data = await people.getWithEvents(personId);
    if (!data) return;

    const personName = formatName(data.person);
    const color = getColor(personId);

    // Gather all events (owned + shared + participating)
    const allEvents = [
      ...(data.events || []),
      ...(data.sharedEvents || []),
      ...(data.participatingEvents || []),
    ];

    // Resolve place coordinates for events with place_id
    const mappedEvents = [];
    for (const ev of allEvents) {
      if (!ev.place_id) continue;
      const place = await getPlace(ev.place_id);
      if (!place || place.latitude == null || place.longitude == null) continue;
      mappedEvents.push({
        eventId: ev.id,
        lat: place.latitude,
        lng: place.longitude,
        type: ev.type || 'other',
        date: ev.date || '',
        place: ev.place || place.name || '',
        personName,
      });
    }

    const birthYear = extractYear(allEvents.find(e => e.type === 'birth')?.date);
    const deathYear = extractYear(allEvents.find(e => e.type === 'death')?.date);
    const years = [birthYear, deathYear].filter(Boolean).join(' - ');

    selected = {
      ...selected,
      [personId]: { person: data.person, color, events: mappedEvents, years },
    };

    addMarkers(personId, color, mappedEvents);
    fitBounds();
  }

  function removePerson(personId) {
    removeMarkers(personId);
    const next = { ...selected };
    delete next[personId];
    selected = next;
    fitBounds();
  }

  function handleEventClick(personId, eventId) {
    zoomToMarker(personId, eventId);
  }

  let selectedEntries = $derived(Object.entries(selected));
  let totalMarkers = $derived(selectedEntries.reduce((sum, [, v]) => sum + v.events.length, 0));

  onMount(() => {
    tomSelect = new TomSelect(selectEl, {
      valueField: 'id',
      labelField: 'label',
      searchField: ['label'],
      placeholder: 'Add person...',
      load(query, callback) {
        people.search(query).then(results => {
          callback(results.map(p => ({
            id: p.id,
            label: [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed',
          })));
        }).catch(() => callback());
      },
      onItemAdd(value) {
        addPerson(value);
        // Clear the input after selection
        tomSelect.clear(true);
      },
      render: {
        option(data, escape) {
          return `<div>${escape(data.label)}</div>`;
        },
        item(data, escape) {
          const bg = getColor(data.id);
          return `<div style="background:${bg};color:#fff;border-radius:3px;padding:2px 8px;font-size:12px">${escape(data.label)}</div>`;
        },
      },
      onItemRemove(value) {
        removePerson(value);
      },
    });

    return () => {
      tomSelect?.destroy();
    };
  });
</script>

<div class="map-panel">
  <div class="map-panel-picker">
    <select bind:this={selectEl} multiple></select>
  </div>

  <div class="map-panel-list">
    {#each selectedEntries as [personId, entry]}
      <div class="map-person">
        <div class="map-person-header">
          <div class="map-person-dot" style:background={entry.color}></div>
          <span class="map-person-name">{formatName(entry.person)}</span>
          {#if entry.years}<span class="map-person-years">{entry.years}</span>{/if}
        </div>
        {#if entry.events.length === 0}
          <div class="map-no-events">No mapped events</div>
        {:else}
          {#each entry.events as ev}
            <div class="map-event-row" onclick={() => handleEventClick(personId, ev.eventId)}>
              <span>&#x1F4CD;</span>
              <span>{ev.type}</span>
              {#if ev.date}<span>&middot; {ev.date}</span>{/if}
              {#if ev.place}<span>&middot; {ev.place}</span>{/if}
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>

  <div class="map-panel-footer">
    {selectedEntries.length} people &middot; {totalMarkers} markers
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/MapPanel.svelte
git commit -m "feat: add MapPanel with TomSelect person picker and event list"
```

---

### Task 5: Wire up App.svelte — view toggle and map integration

Add the Tree/Map toggle to the header, conditionally render the map container and MapPanel, and lazy-init the map.

**Files:**
- Modify: `src/lib/components/App.svelte`

- [ ] **Step 1: Add imports**

At the top of the `<script>` block, add these imports alongside the existing ones:

```js
import { initMap, invalidateSize, clearAllMarkers } from '../../ui/map.js';
import MapPanel from './MapPanel.svelte';
```

- [ ] **Step 2: Add view mode state**

After the existing `let migrationFromUpload = $state(false);` line, add:

```js
let viewMode = $state('tree'); // 'tree' | 'map'
let mapInitialized = false;
```

- [ ] **Step 3: Add view toggle function**

After the `handleMenuKeydown` function, add:

```js
function setViewMode(mode) {
  viewMode = mode;
  if (mode === 'map' && !mapInitialized) {
    // Defer init to next tick so the container is visible
    setTimeout(() => {
      const container = document.getElementById('map-container');
      if (container) {
        initMap(container);
        mapInitialized = true;
      }
    }, 0);
  } else if (mode === 'map') {
    setTimeout(() => invalidateSize(), 0);
  }
}
```

- [ ] **Step 4: Add `map-active` class to `#main`**

Find the existing line:

```html
<div id="main" class:has-panel={selectedPersonId || wizardMode}>
```

Replace with:

```html
<div id="main" class:has-panel={selectedPersonId || wizardMode || viewMode === 'map'} class:map-active={viewMode === 'map'}>
```

- [ ] **Step 5: Add `#map-container` div**

Find the `#chart-container` div:

```html
<div id="chart-container">
  <div id="FamilyChart" class="f3"></div>
  <div id="tree-config"></div>
</div>
```

Add the map container immediately after it (still inside `{#if hasData}`):

```html
<div id="map-container"></div>
```

- [ ] **Step 6: Add view toggle to header**

Find the `<div class="header-actions">` line. Add the view toggle before the "+ Person" button:

```html
<div class="header-actions">
  {#if hasData}
    <div class="view-toggle">
      <button class:active={viewMode === 'tree'} onclick={() => setViewMode('tree')}>Tree</button>
      <button class:active={viewMode === 'map'} onclick={() => setViewMode('map')}>Map</button>
    </div>
  {/if}
  <button class="btn btn-primary" onclick={() => openPersonForm()}>+ Person</button>
```

- [ ] **Step 7: Add MapPanel to the panel area**

Find the panel `<aside>` section:

```html
<aside id="panel">
  <div id="panel-content">
    {#if wizardMode}
      <Wizard startPersonId={selectedPersonId || getConfig('rootPerson')} onclose={closeWizard} />
    {:else if selectedPersonId}
      {#key `${selectedPersonId}-${dataVersion}`}
        <Panel personId={selectedPersonId} onEditChange={(v) => panelEditing = v} />
      {/key}
    {/if}
  </div>
</aside>
```

Replace with:

```html
<aside id="panel">
  <div id="panel-content">
    {#if viewMode === 'map'}
      <MapPanel />
    {:else if wizardMode}
      <Wizard startPersonId={selectedPersonId || getConfig('rootPerson')} onclose={closeWizard} />
    {:else if selectedPersonId}
      {#key `${selectedPersonId}-${dataVersion}`}
        <Panel personId={selectedPersonId} onEditChange={(v) => panelEditing = v} />
      {/key}
    {/if}
  </div>
</aside>
```

- [ ] **Step 8: Manual test**

Run: `npm run dev`

1. Open the app. Verify the Tree/Map toggle appears in the header (only when data exists).
2. Click "Map" — chart should hide, map should appear with OSM tiles centered on Ireland.
3. The panel should show the TomSelect picker.
4. Search for a person, select them — their events should appear as colored markers.
5. Click an event row in the panel — map should zoom to that marker and open popup.
6. Click a marker — popup shows event type, date, person name.
7. Remove the person tag — markers disappear.
8. Click "Tree" — chart returns, panel returns to normal.
9. Click "Map" again — previous state (selected people, markers) should be preserved.

- [ ] **Step 9: Commit**

```bash
git add src/lib/components/App.svelte
git commit -m "feat: wire up Tree/Map view toggle and map integration in App.svelte"
```

---

### Task 6: Run full test suite and fix any issues

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: All tests pass (168+). No regressions.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean production build with no errors.

- [ ] **Step 3: Commit any fixups needed**
