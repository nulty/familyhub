// web/src/util/place-type-seeds.js

/**
 * Seed data for the place_types table.
 * Keys are Nominatim address object keys (or custom genealogy types).
 * Labels are the default English display names.
 */
export const PLACE_TYPE_SEEDS = [
  { key: 'country', label: 'Country', source: 'nominatim' },
  { key: 'region', label: 'Region', source: 'nominatim' },
  { key: 'state', label: 'State', source: 'nominatim' },
  { key: 'state_district', label: 'State District', source: 'nominatim' },
  { key: 'county', label: 'County', source: 'nominatim' },
  { key: 'municipality', label: 'Municipality', source: 'nominatim' },
  { key: 'city', label: 'City', source: 'nominatim' },
  { key: 'city_district', label: 'City District', source: 'nominatim' },
  { key: 'borough', label: 'Borough', source: 'nominatim' },
  { key: 'suburb', label: 'Suburb', source: 'nominatim' },
  { key: 'quarter', label: 'Quarter', source: 'nominatim' },
  { key: 'neighbourhood', label: 'Neighbourhood', source: 'nominatim' },
  { key: 'town', label: 'Town', source: 'nominatim' },
  { key: 'village', label: 'Village', source: 'nominatim' },
  { key: 'hamlet', label: 'Hamlet', source: 'nominatim' },
  { key: 'isolated_dwelling', label: 'Isolated Dwelling', source: 'nominatim' },
  { key: 'road', label: 'Road', source: 'nominatim' },
  { key: 'house_number', label: 'House Number', source: 'nominatim' },
  { key: 'house_name', label: 'House Name', source: 'nominatim' },
  { key: 'farm', label: 'Farm', source: 'nominatim' },
];

/**
 * Rank order for decomposition: most general → most specific.
 * Used to sort Nominatim address keys into parent → child order.
 * Keys not in this list are ignored during decomposition.
 */
export const ADDRESS_RANK = [
  'country', 'region', 'state', 'state_district', 'county', 'municipality',
  'city', 'city_district', 'borough', 'suburb', 'quarter', 'neighbourhood',
  'town', 'village', 'hamlet', 'isolated_dwelling',
  'road', 'house_number', 'house_name', 'farm',
];

/**
 * Display groups for type pickers — most specific → most general.
 * Most user-added places are leaves (buildings, streets, settlements);
 * higher-level types (country, state) are usually created automatically
 * by geocoding, so the common picks live at the top of the picker.
 * Within a group, keys are listed most specific first.
 * Types not listed here fall into "Facility / POI" (nominatim source) or
 * "Custom" (user-created types).
 */
export const TYPE_GROUPS = [
  { label: 'Building',          keys: ['house_number', 'house_name', 'farm'] },
  { label: 'Street',            keys: ['road'] },
  { label: 'Within settlement', keys: ['neighbourhood', 'quarter', 'suburb'] },
  { label: 'Settlement',        keys: ['isolated_dwelling', 'hamlet', 'village', 'town'] },
  { label: 'Municipal',         keys: ['borough', 'city_district', 'city', 'municipality'] },
  { label: 'Subdivision',       keys: ['county', 'state_district', 'state'] },
  { label: 'National',          keys: ['region', 'country'] },
];

/**
 * Group an array of place types by specificity.
 * Returns: [{ label: string, types: PlaceType[] }, ...] in display order.
 *
 * @param {Array<{key: string, label: string, source: string}>} types
 */
export function groupTypes(types) {
  const byKey = new Map(types.map(t => [t.key, t]));
  const placed = new Set();
  const groups = [];

  for (const g of TYPE_GROUPS) {
    const items = [];
    for (const k of g.keys) {
      const t = byKey.get(k);
      if (t) {
        items.push(t);
        placed.add(k);
      }
    }
    if (items.length > 0) groups.push({ label: g.label, types: items });
  }

  const others = types
    .filter(t => !placed.has(t.key) && t.source === 'nominatim')
    .sort((a, b) => a.label.localeCompare(b.label));
  if (others.length > 0) groups.push({ label: 'Facility / POI', types: others });

  const custom = types
    .filter(t => !placed.has(t.key) && t.source !== 'nominatim')
    .sort((a, b) => a.label.localeCompare(b.label));
  if (custom.length > 0) groups.push({ label: 'Custom', types: custom });

  return groups;
}
