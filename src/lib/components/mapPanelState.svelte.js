// Module-level state for MapPanel so it survives view switches (Tree ↔ Map).
// MapPanel mounts/unmounts when the view toggles; keeping this state outside
// the component mirrors how `personMarkers` already persists in ui/map.js.
export const mapPanelState = $state({ selected: {} });
export const colorMap = new Map();
export const placeCache = new Map();
