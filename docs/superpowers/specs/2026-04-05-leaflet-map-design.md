# Leaflet Map View

## Summary

A map view that shows geocoded event locations for selected people. Accessible via a Tree/Map toggle in the header. Uses Leaflet with OpenStreetMap tiles. A dedicated map panel with a TomSelect person picker lets users add people whose events are then plotted as color-coded markers.

## UX Flow

1. User clicks "Map" in the Tree/Map toggle in the header.
2. The family chart hides, a Leaflet map fills the main content area.
3. The person detail panel is replaced by the map panel.
4. User searches for people in the TomSelect picker and adds them.
5. Each added person's geocoded events appear as colored markers on the map.
6. The person appears below the picker with their color dot and event list.
7. Clicking an event in the panel zooms the map to that marker and opens its popup.
8. Clicking a marker on the map shows a popup with event type, date, and person name.
9. Removing a person's tag clears their markers from the map.
10. User clicks "Tree" to switch back — map is hidden, chart and normal panel return.

## View Toggle

A two-button toggle in the header, positioned before the "+ Person" button. One button is active at a time (Tree or Map). Styled as a segmented control matching the app's dark theme.

When switching views:
- **To Map:** Hide `#chart-container`. Show `#map-container`. Replace the panel content with `MapPanel`. Initialize the map if not already done (lazy init on first switch).
- **To Tree:** Hide `#map-container`. Show `#chart-container`. Restore normal panel behavior. The map and its state persist in the background — switching back preserves selected people and markers.

## Map

- **Library:** Leaflet (`leaflet` npm package).
- **Tiles:** OpenStreetMap default tile layer (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`).
- **Container:** `#map-container` div, sibling to `#chart-container`, same size/position. Hidden by default, shown when map view is active.
- **Default view:** Centered on Ireland (53.4, -8.0), zoom 7. If markers are present, fit bounds to include all markers.
- **Markers:** Leaflet `circleMarker` with a 8px radius, colored per person, with white border. Each marker stores a reference to its event data for the popup.
- **Popups:** On marker click, show Leaflet popup with:
  ```
  Birth
  3 Sep 1901
  John Murphy
  ```
- **Zoom to event:** When user clicks an event in the panel, call `map.setView([lat, lng], 14)` and open the marker's popup.

## Map Panel (`MapPanel.svelte`)

A Svelte 5 component that replaces the person panel when map view is active.

### TomSelect Picker

- Multi-select mode with tag-style display.
- Searches people via `people.search(query)` — same async search used by `PersonPicker.svelte`.
- Each selected person is rendered as a tag colored with their assigned color.
- Removing a tag removes the person and their markers.
- Install `tom-select` as a dependency. Import its CSS. Initialize on the `<select>` element in an `$effect`.

### Selected People List

Below the picker, one section per selected person:
- Color dot + full name + birth/death years
- List of their geocoded events: pin icon, event type, date, place name
- Only events with a `place_id` that resolves to a place with `latitude` and `longitude` are shown
- Clicking an event row zooms the map to that marker and opens its popup

### Footer

`{n} people · {m} markers` count at the bottom.

## Color Assignment

A palette of 8 distinct colors:
```js
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393'];
```

Colors are assigned sequentially as people are added. When a person is removed, their color is freed and reused for the next addition.

## Data Flow

1. User selects a person in TomSelect.
2. Call `people.getWithEvents(personId)` to get their events.
3. Filter events to those with a `place_id`.
4. For each such event, call `places.get(event.place_id)` to get lat/lng.
5. Skip events whose place has no lat/lng (not geocoded).
6. Create Leaflet markers for the remaining events.
7. Fit map bounds to all visible markers.

To avoid fetching the same place repeatedly, cache place lookups in a `Map<placeId, place>` within the panel's lifecycle.

## Dependencies

- `leaflet` — map library (new npm dependency)
- `tom-select` — multi-select picker (new npm dependency)
- Leaflet CSS loaded via import in the map module
- TomSelect CSS loaded via import in MapPanel

## New Files

- `src/ui/map.js` — Leaflet wrapper. Exports: `initMap(container)`, `addMarkers(personId, color, events)`, `removeMarkers(personId)`, `clearAllMarkers()`, `zoomToMarker(eventId)`, `fitBounds()`. Vanilla JS, similar pattern to `src/ui/tree.js`.
- `src/lib/components/MapPanel.svelte` — Map side panel with TomSelect picker, selected people list, event rows, footer.

## Modified Files

- `App.svelte` — Add view toggle state (`viewMode`), render `#map-container`, conditionally show MapPanel vs Panel/Wizard, lazy-init map on first switch.
- `styles.css` — `#map-container` styles (hidden by default, full height), view toggle button styles.
- `index.html` — Add Leaflet CSS from node_modules (or import in JS).

## Edge Cases

- Person with no geocoded events: show in the selected list but with "No mapped events" message instead of event rows. No markers added.
- All markers at the same location: Leaflet handles overlapping markers; popups still accessible by clicking.
- Switching to tree view and back: map state preserved (selected people, markers, zoom level).
- Window resize: Leaflet's `invalidateSize()` called when map becomes visible again.
