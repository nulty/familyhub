/**
 * db/db.js
 * Main-thread API — thin wrapper that sends messages to the worker
 * and returns promises. Import this everywhere instead of talking
 * to the worker directly.
 */

import { ulid } from '../util/ulid.js';
import { parseSortDate } from '../util/dates.js';

let worker = null;
let pending = new Map();
let msgId = 0;
let readyPromise = null;

export async function initDB() {
  // worker.js and schema.sql live in public/ and are served at the base path.
  // Pass sqlite3.dir so the SQLite WASM loader fetches .wasm from the CDN.
  const base = import.meta.env.BASE_URL || '/';
  const workerURL = new URL(base + 'worker.js', window.location.origin);
  workerURL.searchParams.set('sqlite3.dir',
    'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.46.1-build2/sqlite-wasm/jswasm');
  worker = new Worker(workerURL, { type: 'classic' });

  worker.onmessage = (e) => {
    const { id, result, error } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (error) p.reject(new Error(error));
    else p.resolve(result);
  };

  worker.onerror = (e) => {
    console.error('[db] Worker error', e);
  };

  readyPromise = call('init');
  return readyPromise;
}

async function call(method, ...args) {
  // Wait for DB to be ready before any call (except init itself)
  if (method !== 'init' && readyPromise) await readyPromise;
  if (!worker) throw new Error('Database not initialized — call initDB() first');
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}

// ─── People ───────────────────────────────────────────────────────────────────

export const people = {
  create(data) {
    return call('createPerson', { id: ulid(), ...data });
  },
  get(id) {
    return call('getPerson', id);
  },
  update(id, fields) {
    return call('updatePerson', id, fields);
  },
  delete(id) {
    return call('deletePerson', id);
  },
  search(query) {
    return call('searchPeople', query);
  },
  getWithEvents(id) {
    return call('getPersonWithEvents', id);
  },
};

// ─── Relationships ────────────────────────────────────────────────────────────

export const relationships = {
  addPartner(personAId, personBId) {
    return call('addPartner', ulid(), personAId, personBId);
  },
  addParentChild(parentId, childId) {
    return call('addParentChild', ulid(), parentId, childId);
  },
  remove(id) {
    return call('removeRelationship', id);
  },
  getFamily(personId) {
    return call('getFamily', personId);
  },
};

// ─── Events ───────────────────────────────────────────────────────────────────

export const events = {
  create(personId, data) {
    const sort_date = parseSortDate(data.date);
    return call('createEvent', { id: ulid(), person_id: personId, sort_date, ...data });
  },
  update(id, fields) {
    if (fields.date !== undefined) {
      fields.sort_date = parseSortDate(fields.date);
    }
    return call('updateEvent', id, fields);
  },
  delete(id) {
    return call('deleteEvent', id);
  },
  list(personId) {
    return call('listEvents', personId);
  },
  addParticipant(eventId, personId, role) {
    return call('addParticipant', { id: ulid(), event_id: eventId, person_id: personId, role });
  },
  removeParticipant(eventId, personId) {
    return call('removeParticipant', eventId, personId);
  },
  getForParticipant(personId) {
    return call('getEventsForParticipant', personId);
  },
  getParticipants(eventId) {
    return call('getParticipantsForEvent', eventId);
  },
  updateParticipantRole(eventId, personId, role) {
    return call('updateParticipantRole', eventId, personId, role);
  },
};

// ─── Repositories ─────────────────────────────────────────────────────────────

export const repositories = {
  create(data) {
    return call('createRepository', { id: ulid(), ...data });
  },
  get(id) {
    return call('getRepository', id);
  },
  update(id, fields) {
    return call('updateRepository', id, fields);
  },
  delete(id) {
    return call('deleteRepository', id);
  },
  list() {
    return call('listRepositories');
  },
  search(query) {
    return call('searchRepositories', query);
  },
};

// ─── Sources ──────────────────────────────────────────────────────────────────

export const sources = {
  create(data) {
    return call('createSource', { id: ulid(), ...data });
  },
  get(id) {
    return call('getSource', id);
  },
  update(id, fields) {
    return call('updateSource', id, fields);
  },
  delete(id) {
    return call('deleteSource', id);
  },
  list() {
    return call('listSources');
  },
  search(query) {
    return call('searchSources', query);
  },
  listForEvent(eventId) {
    return call('listSourcesForEvent', eventId);
  },
};

// ─── Citations ────────────────────────────────────────────────────────────────

export const citations = {
  create(data) {
    return call('createCitation', { id: ulid(), ...data });
  },
  get(id) {
    return call('getCitation', id);
  },
  update(id, fields) {
    return call('updateCitation', id, fields);
  },
  delete(id) {
    return call('deleteCitation', id);
  },
  listForEvent(eventId) {
    return call('listCitationsForEvent', eventId);
  },
  listForSource(sourceId) {
    return call('listCitationsForSource', sourceId);
  },
};

// ─── Places ──────────────────────────────────────────────────────────────────

export const places = {
  create(data) {
    return call('createPlace', { id: ulid(), ...data });
  },
  get(id) {
    return call('getPlace', id);
  },
  update(id, fields) {
    return call('updatePlace', id, fields);
  },
  delete(id) {
    return call('deletePlace', id);
  },
  list() {
    return call('listPlaces');
  },
  tree() {
    return call('getPlaceTree');
  },
  search(query) {
    return call('searchPlaces', query);
  },
  findByNameTypeParent(name, type, parentId) {
    return call('findPlaceByNameTypeParent', name, type, parentId);
  },
  hierarchy(id) {
    return call('getPlaceHierarchy', id);
  },
  children(parentId) {
    return call('getPlaceChildren', parentId);
  },
  people(placeId) {
    return call('getPeopleByPlace', placeId);
  },
  events(placeId) {
    return call('getEventsByPlace', placeId);
  },
};

// ─── Temporal ─────────────────────────────────────────────────────────────────

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export const temporal = {
  findNearDate(dateStr, opts = {}) {
    const ms = parseSortDate(dateStr);
    if (ms == null) return Promise.resolve([]);
    const { windowYears = 2, ...rest } = opts;
    return call('findEventsNearDate', ms, windowYears * YEAR_MS, rest);
  },
  findNearEvent(eventId, opts = {}) {
    const { windowYears = 2, ...rest } = opts;
    return call('findEventsNearEvent', eventId, windowYears * YEAR_MS, rest);
  },
};

// ─── Graph ────────────────────────────────────────────────────────────────────

export const graph = {
  getData() {
    return call('getGraphData');
  },
};

// ─── Bulk / GEDCOM ────────────────────────────────────────────────────────────

export const bulk = {
  import(data) {
    return call('bulkImport', data);
  },
  exportAll() {
    return call('exportAll');
  },
  exportDatabase() {
    return call('exportDatabase');
  },
};

// ─── Reset ───────────────────────────────────────────────────────────────────

export function resetDatabase() {
  return call('resetDatabase');
}

export function nukeDatabase() {
  return call('nukeDatabase');
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  return call('getStats');
}
