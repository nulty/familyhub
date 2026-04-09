/**
 * db/db.js
 * Main-thread API — thin wrapper that sends messages to the worker
 * and returns promises. Import this everywhere instead of talking
 * to the worker directly.
 */

import { ulid } from '../util/ulid.js';
import { parseSortDate } from '../util/dates.js';
import { getMode } from '../config.js';
import { remoteCall } from './remote.js';
import { emit, COLLAB_SYNC_STATUS } from '../state.js';

const WRITE_METHODS = new Set([
  'createPerson', 'updatePerson', 'deletePerson',
  'createPersonName', 'updatePersonName', 'deletePersonName',
  'addPartner', 'addParentChild', 'removeRelationship',
  'createEvent', 'updateEvent', 'deleteEvent',
  'addParticipant', 'removeParticipant', 'updateParticipantRole',
  'createRepository', 'updateRepository', 'deleteRepository',
  'createSource', 'updateSource', 'deleteSource',
  'createCitation', 'updateCitation', 'deleteCitation',
  'linkCitationEvent', 'unlinkCitationEvent',
  'createPlace', 'updatePlace', 'deletePlace',
  'bulkImport', 'resetDatabase',
]);

let worker = null;
let pending = new Map();
let msgId = 0;
let readyPromise = null;

export async function initDB(dbName = 'familytree-local.db') {
  // Module worker — Vite bundles imports automatically.
  // schema.sql remains in public/ and is fetched at runtime by the worker.
  const base = import.meta.env.BASE_URL || '/';
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

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

  // Pass the base URL so the worker can fetch schema.sql from public/
  const schemaBaseUrl = new URL(base, window.location.origin).href;
  readyPromise = call('init', schemaBaseUrl, dbName);
  const result = await readyPromise;
  return result;
}

export function runMigrations() {
  return call('runMigrations');
}

async function workerCall(method, ...args) {
  if (method !== 'init' && method !== 'closeAndClear' && readyPromise) await readyPromise;
  if (!worker) throw new Error('Database not initialized — call initDB() first');
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, method, args });
  });
}

async function call(method, ...args) {
  // Internal worker methods always go to the worker
  if (method === 'init' || method === 'closeAndClear' || method === 'runMigrations'
      || method === 'exportDatabase' || method === 'importDatabase') {
    return workerCall(method, ...args);
  }

  const mode = getMode();

  if (mode === 'local') {
    return workerCall(method, ...args);
  }

  // Collab mode
  if (WRITE_METHODS.has(method)) {
    if (!navigator.onLine) {
      throw new Error("Can't save while offline");
    }
    const result = await remoteCall(method, ...args);
    // Update local cache by replaying the write
    try { await workerCall(method, ...args); } catch {}
    return result;
  }

  // Reads hit local cache
  return workerCall(method, ...args);
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

// ─── Person Names ─────────────────────────────────────────────────────────────

export const personNames = {
  create(data) {
    return call('createPersonName', { id: ulid(), ...data });
  },
  update(id, fields) {
    return call('updatePersonName', id, fields);
  },
  delete(id) {
    return call('deletePersonName', id);
  },
  list(personId) {
    return call('listPersonNames', personId);
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
  get(id) {
    return call('getEvent', id);
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
  search(query) {
    return call('searchCitations', query);
  },
  listForEvent(eventId) {
    return call('listCitationsForEvent', eventId);
  },
  listForSource(sourceId) {
    return call('listCitationsForSource', sourceId);
  },
  linkEvent(citationId, eventId) {
    return call('linkCitationEvent', citationId, eventId);
  },
  unlinkEvent(citationId, eventId) {
    return call('unlinkCitationEvent', citationId, eventId);
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
  importDatabase(bytes) {
    return call('importDatabase', bytes);
  },
};

// ─── Reset ───────────────────────────────────────────────────────────────────

export function resetDatabase() {
  return call('nukeDatabase');
}

export async function nukeDatabase() {
  // Ask the worker to close the DB and release SAH pool handles
  if (worker) {
    try {
      await workerCall('closeAndClear');
    } catch {
      // Worker may be unresponsive
    }
    worker.terminate();
    worker = null;
    pending.clear();
    readyPromise = null;
  }

  // Clear all OPFS files
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) {
    await root.removeEntry(name, { recursive: true });
  }
}

export async function clearDatabase(dbName) {
  if (worker) {
    try { await workerCall('closeAndClear'); } catch {}
    worker.terminate();
    worker = null;
    pending.clear();
    readyPromise = null;
  }
  const root = await navigator.storage.getDirectory();
  for await (const [name] of root.entries()) {
    if (name.includes(dbName)) {
      await root.removeEntry(name, { recursive: true });
    }
  }
}

/**
 * Full sync-down: download all data from the API and import into local cache.
 */
export async function syncDown() {
  const mode = getMode();
  if (mode !== 'collab') return;

  emit(COLLAB_SYNC_STATUS, 'syncing');

  try {
    const data = await remoteCall('exportAll');
    await workerCall('nukeDatabase');
    if (data && Object.keys(data).some(k => Array.isArray(data[k]) && data[k].length > 0)) {
      await workerCall('bulkImport', data);
    }
    emit(COLLAB_SYNC_STATUS, 'online');
  } catch (e) {
    console.error('[db] Sync-down failed:', e);
    emit(COLLAB_SYNC_STATUS, 'offline');
  }
}

/**
 * Switch the database to a different OPFS file.
 */
export async function switchDatabase(dbName) {
  if (worker) {
    try { await workerCall('closeAndClear'); } catch {}
    worker.terminate();
    worker = null;
    pending.clear();
    readyPromise = null;
  }
  return initDB(dbName);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export function getStats() {
  return call('getStats');
}
