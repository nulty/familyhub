/**
 * place-types.js — Shared place type definitions and helpers
 */

export const PLACE_TYPES = [
  '', 'country', 'province', 'county', 'barony',
  'civil_parish', 'church_parish', 'parish',
  'townland', 'city', 'town', 'suburb', 'village',
  'street', 'address', 'cemetery',
];

export function formatPlaceType(t) {
  if (!t) return '(none)';
  return t.replace(/_/g, ' ');
}

export function placeTypeOptions(selectedType = '', emptyLabel = '(none)') {
  return [...PLACE_TYPES]
    .sort((a, b) => !a ? 1 : !b ? -1 : formatPlaceType(a).localeCompare(formatPlaceType(b)))
    .map(t => `<option value="${t}" ${t === selectedType ? 'selected' : ''}>${t ? formatPlaceType(t) : emptyLabel}</option>`)
    .join('');
}
