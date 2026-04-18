/**
 * place-types.js — Place type display helpers.
 * Place type definitions now live in the place_types table (DB-backed).
 */

export function formatPlaceType(t) {
  if (!t) return '(none)';
  return t.replace(/_/g, ' ');
}
