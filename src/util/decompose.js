import { ADDRESS_RANK } from './place-type-seeds.js';

/**
 * Decompose a Nominatim result into a parent→child place chain.
 *
 * Walks the Nominatim address object in general → specific order (per ADDRESS_RANK),
 * deduplicating each part against existing place records via findPlaceByNameTypeParent.
 * Stores coordinates on the most specific place, repoints events from the original
 * flat place to the new chain, and deletes the original if it's now redundant.
 *
 * @param {Object} opts
 * @param {Object} opts.nominatimResult — { lat, lon, address: { country: '...', city: '...' } }
 * @param {string} opts.originalPlaceId — the flat place record being replaced
 * @param {string[]} opts.eventIds — events referencing the original place
 * @param {Object} opts.handlers — { findPlaceByNameTypeParent, createPlace, ensurePlaceType, updatePlace, updateEvent, deletePlace }
 * @param {Function} opts.generateId — () => string — ULID/UUID generator
 * @returns {Promise<string|null>} ID of most-specific place, or null if address had no ranked keys
 */
export async function decomposeAddress({ nominatimResult, originalPlaceId, eventIds, handlers, generateId }) {
  const { lat, lon, address } = nominatimResult;

  // Extract ranked parts in general → specific order
  const parts = ADDRESS_RANK
    .filter(key => address[key] != null)
    .map(key => ({ type: key, name: String(address[key]) }));

  if (parts.length === 0) return null;

  // Build chain, deduplicating against existing records
  let parentId = null;
  let lastPlaceId = null;

  for (const part of parts) {
    await handlers.ensurePlaceType(part.type);

    const existing = await handlers.findPlaceByNameTypeParent(part.name, part.type, parentId);
    if (existing) {
      parentId = existing.id;
      lastPlaceId = existing.id;
    } else {
      const placeId = generateId();
      await handlers.createPlace({
        id: placeId,
        name: part.name,
        type: part.type,
        parent_id: parentId,
        notes: '',
      });
      parentId = placeId;
      lastPlaceId = placeId;
    }
  }

  // Store coordinates on the most specific place
  if (lastPlaceId) {
    await handlers.updatePlace(lastPlaceId, { latitude: parseFloat(lat), longitude: parseFloat(lon) });
  }

  // Repoint events and clear free-text place field
  for (const eventId of eventIds) {
    await handlers.updateEvent(eventId, { place_id: lastPlaceId, place: '' });
  }

  // Delete original flat place if it's different from what we created
  if (originalPlaceId && originalPlaceId !== lastPlaceId) {
    await handlers.deletePlace(originalPlaceId);
  }

  return lastPlaceId;
}
