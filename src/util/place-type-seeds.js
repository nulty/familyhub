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
