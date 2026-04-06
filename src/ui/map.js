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
      <div style="font-weight:600;text-transform:capitalize">${ev.type}${ev.ownerName ? ` <span style="font-weight:400;color:#666">— ${ev.ownerName}</span>` : ''}</div>
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

// ── Pick mode ────────────────────────────────────────────────────────────────

let pickCallback = null;

function onPickClick(e) {
  if (!pickCallback) return;
  const cb = pickCallback;
  stopPicking();
  cb({ lat: e.latlng.lat, lng: e.latlng.lng });
}

/**
 * Enter pick mode — next click on the map calls callback with {lat, lng}.
 */
export function startPicking(callback) {
  stopPicking();
  pickCallback = callback;
  map.getContainer().style.cursor = 'crosshair';
  map.on('click', onPickClick);
}

/**
 * Exit pick mode without firing the callback.
 */
export function stopPicking() {
  if (!map) return;
  pickCallback = null;
  map.getContainer().style.cursor = '';
  map.off('click', onPickClick);
}

/**
 * Call when the map container becomes visible to fix tile rendering.
 */
export function invalidateSize() {
  map?.invalidateSize();
}
