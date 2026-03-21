/**
 * db/worker.js
 * SQLite OPFS worker — runs in a SharedWorker or dedicated Worker.
 * Handles all DB access serially to avoid concurrency issues.
 *
 * SQL handler logic lives in src/db/handlers.js for testability.
 * This file handles: WASM init, OPFS setup, message queue, migrations.
 */

const SQLITE_CDN = 'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.46.1-build2/sqlite-wasm/jswasm';
importScripts(SQLITE_CDN + '/sqlite3.js');

let db = null;
let sqlite3Api = null;
let handlers = null;

// We can't use ES module imports in a classic worker loaded via importScripts,
// so the handlers are inlined by importing the source at build time.
// In production, Vite copies this file as-is to dist/, so we load handlers
// by dynamically importing from the src directory.
let helpers = null;

async function initDB() {
  const sqlite3 = await sqlite3InitModule({
    printErr: console.error,
  });

  sqlite3Api = sqlite3;

  // Try OPFS SAH pool VFS (works in workers without a separate proxy worker),
  // then fall back to the legacy OPFS VFS, then to in-memory.
  let vfsName = null;
  if (sqlite3.installOpfsSAHPoolVfs) {
    try {
      const poolUtil = await sqlite3.installOpfsSAHPoolVfs({ name: 'opfs-sahpool' });
      vfsName = poolUtil.vfsName;
      console.log('[worker] OPFS SAH pool VFS ready:', vfsName);
    } catch (e) {
      console.warn('[worker] OPFS SAH pool not available:', e.message);
    }
  }

  if (vfsName) {
    db = new sqlite3.oo1.DB('/familytree.db', 'cw', vfsName);
    console.log('[worker] Opened OPFS database via', vfsName);
  } else if (sqlite3.capi.sqlite3_vfs_find('opfs')) {
    db = new sqlite3.oo1.OpfsDb('/familytree.db');
    console.log('[worker] Opened OPFS database (legacy VFS)');
  } else {
    db = new sqlite3.oo1.DB(':memory:');
    console.warn('[worker] OPFS not available, using in-memory DB (data will not persist)');
  }

  // Apply base schema (CREATE IF NOT EXISTS — safe on existing DBs)
  const schemaResponse = await fetch(new URL('./schema.sql', self.location.href));
  const schema = await schemaResponse.text();
  db.exec(schema);

  // Create helpers and handlers
  helpers = createWasmHelpers(db);
  handlers = createHandlersFromHelpers(helpers);

  // Run migrations
  applyMigrations();
}

// ─── SQL Helpers (WASM adapter) ───────────────────────────────────────────────

function createWasmHelpers(db) {
  function all(sql, params = []) {
    const rows = [];
    db.exec({ sql, bind: params, rowMode: 'object', callback: (row) => rows.push(row) });
    return rows;
  }

  function get(sql, params = []) {
    return all(sql, params)[0] ?? null;
  }

  function run(sql, params = []) {
    db.exec({ sql, bind: params });
    return db.changes();
  }

  function transaction(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  return { all, get, run, transaction };
}

// ─── Handler factory (duplicated from src/db/handlers.js since classic workers can't use ES imports) ───

function createHandlersFromHelpers(h) {
  const { all, get, run, transaction } = h;

  const handlers = {
    createPerson({ id, given_name = '', surname = '', gender = 'U', notes = '' }) {
      const now = Date.now();
      run(`INSERT INTO people (id, given_name, surname, gender, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [id, given_name, surname, gender, notes, now, now]);
      return get('SELECT * FROM people WHERE id = ?', [id]);
    },
    getPerson(id) { return get('SELECT * FROM people WHERE id = ?', [id]); },
    updatePerson(id, fields) {
      const allowed = ['given_name', 'surname', 'gender', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM people WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE people SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM people WHERE id = ?', [id]);
    },
    deletePerson(id) { run('DELETE FROM people WHERE id = ?', [id]); return { ok: true }; },
    searchPeople(query) {
      if (!query || query.trim() === '') return all('SELECT * FROM people ORDER BY surname, given_name LIMIT 100');
      const q = `%${query}%`;
      return all(`SELECT * FROM people WHERE given_name LIKE ? OR surname LIKE ? OR (given_name || ' ' || surname) LIKE ? ORDER BY surname, given_name LIMIT 50`, [q, q, q]);
    },
    getPersonWithEvents(id) {
      const person = get('SELECT * FROM people WHERE id = ?', [id]);
      if (!person) return null;
      const events = all(`SELECT e.*, (SELECT json_group_array(json_object('id', s.id, 'title', s.title, 'url', s.url, 'accessed', s.accessed, 'notes', s.notes)) FROM sources s WHERE s.event_id = e.id) as sources_json, (SELECT json_group_array(json_object('person_id', ep.person_id, 'role', ep.role, 'name', p.given_name || ' ' || p.surname)) FROM event_participants ep JOIN people p ON p.id = ep.person_id WHERE ep.event_id = e.id) as participants_json FROM events e WHERE e.person_id = ? ORDER BY COALESCE(e.sort_date, 9999999999999)`, [id]);
      for (const ev of events) { ev.sources = JSON.parse(ev.sources_json || '[]'); ev.participants = JSON.parse(ev.participants_json || '[]'); delete ev.sources_json; delete ev.participants_json; }
      const participatingEvents = all(`SELECT e.*, ep.role AS participant_role, owner.given_name || ' ' || owner.surname AS owner_name, owner.id AS owner_id, (SELECT json_group_array(json_object('id', s.id, 'title', s.title, 'url', s.url, 'accessed', s.accessed, 'notes', s.notes)) FROM sources s WHERE s.event_id = e.id) as sources_json FROM event_participants ep JOIN events e ON e.id = ep.event_id JOIN people owner ON owner.id = e.person_id WHERE ep.person_id = ? AND e.person_id != ? ORDER BY COALESCE(e.sort_date, 9999999999999)`, [id, id]);
      for (const ev of participatingEvents) { ev.sources = JSON.parse(ev.sources_json || '[]'); delete ev.sources_json; }
      const family = handlers.getFamily(id);
      return { person, events, participatingEvents, ...family };
    },
    addPartner(id, personAId, personBId) {
      const now = Date.now();
      run(`INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?, ?, ?, 'partner', ?)`, [id, personAId, personBId, now]);
      return get('SELECT * FROM relationships WHERE id = ?', [id]);
    },
    addParentChild(id, parentId, childId) {
      const now = Date.now();
      run(`INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?, ?, ?, 'parent_child', ?)`, [id, parentId, childId, now]);
      return get('SELECT * FROM relationships WHERE id = ?', [id]);
    },
    removeRelationship(id) { run('DELETE FROM relationships WHERE id = ?', [id]); return { ok: true }; },
    getFamily(personId) {
      const parents = all(`SELECT p.*, r.id as rel_id FROM people p JOIN relationships r ON r.person_a_id = p.id WHERE r.person_b_id = ? AND r.type = 'parent_child'`, [personId]);
      const children = all(`SELECT p.*, r.id as rel_id FROM people p JOIN relationships r ON r.person_b_id = p.id WHERE r.person_a_id = ? AND r.type = 'parent_child'`, [personId]);
      const partners = all(`SELECT p.*, r.id as rel_id FROM people p JOIN relationships r ON (r.person_a_id = ? AND r.person_b_id = p.id) OR (r.person_b_id = ? AND r.person_a_id = p.id) WHERE r.type = 'partner'`, [personId, personId]);
      return { parents, children, partners };
    },
    createEvent({ id, person_id, type = 'other', date = '', place = '', notes = '', sort_date = null }) {
      const now = Date.now();
      run(`INSERT INTO events (id, person_id, type, date, place, notes, sort_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, person_id, type, date, place, notes, sort_date, now, now]);
      return get('SELECT * FROM events WHERE id = ?', [id]);
    },
    updateEvent(id, fields) {
      const allowed = ['type', 'date', 'place', 'notes', 'sort_date'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM events WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE events SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM events WHERE id = ?', [id]);
    },
    deleteEvent(id) { run('DELETE FROM events WHERE id = ?', [id]); return { ok: true }; },
    listEvents(personId) { return all('SELECT * FROM events WHERE person_id = ? ORDER BY COALESCE(sort_date, 9999999999999)', [personId]); },
    addParticipant({ id, event_id, person_id, role = 'witness' }) {
      const now = Date.now();
      run(`INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)`, [id, event_id, person_id, role, now]);
      return { id, event_id, person_id, role };
    },
    removeParticipant(eventId, personId) { run('DELETE FROM event_participants WHERE event_id = ? AND person_id = ?', [eventId, personId]); return { ok: true }; },
    getEventsForParticipant(personId) { return all(`SELECT e.*, ep.role, p.given_name || ' ' || p.surname AS owner_name, p.id AS owner_id FROM event_participants ep JOIN events e ON e.id = ep.event_id JOIN people p ON p.id = e.person_id WHERE ep.person_id = ? ORDER BY COALESCE(e.sort_date, 9999999999999)`, [personId]); },
    getParticipantsForEvent(eventId) { return all(`SELECT ep.id, ep.role, ep.person_id, ep.created_at, p.given_name, p.surname, p.gender FROM event_participants ep JOIN people p ON p.id = ep.person_id WHERE ep.event_id = ? ORDER BY ep.created_at`, [eventId]); },
    updateParticipantRole(eventId, personId, role) { run('UPDATE event_participants SET role = ? WHERE event_id = ? AND person_id = ?', [role, eventId, personId]); return get('SELECT * FROM event_participants WHERE event_id = ? AND person_id = ?', [eventId, personId]); },
    createSource({ id, event_id, title = '', url = '', accessed = '', notes = '' }) {
      const now = Date.now();
      run(`INSERT INTO sources (id, event_id, title, url, accessed, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [id, event_id, title, url, accessed, notes, now, now]);
      return get('SELECT * FROM sources WHERE id = ?', [id]);
    },
    updateSource(id, fields) {
      const allowed = ['title', 'url', 'accessed', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM sources WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE sources SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM sources WHERE id = ?', [id]);
    },
    deleteSource(id) { run('DELETE FROM sources WHERE id = ?', [id]); return { ok: true }; },
    listSources(eventId) { return all('SELECT * FROM sources WHERE event_id = ? ORDER BY created_at', [eventId]); },
    findEventsNearDate(targetMs, windowMs, options = {}) {
      const { excludePersonId, personIds, eventTypes, limit = 100 } = options;
      const lo = targetMs - windowMs; const hi = targetMs + windowMs;
      let sql = `SELECT e.*, p.given_name, p.surname, p.gender, ABS(e.sort_date - ?) AS distance_ms FROM events e JOIN people p ON p.id = e.person_id WHERE e.sort_date BETWEEN ? AND ?`;
      const params = [targetMs, lo, hi];
      if (excludePersonId) { sql += ' AND e.person_id != ?'; params.push(excludePersonId); }
      if (personIds && personIds.length > 0) { sql += ` AND e.person_id IN (${personIds.map(() => '?').join(',')})`; params.push(...personIds); }
      if (eventTypes && eventTypes.length > 0) { sql += ` AND e.type IN (${eventTypes.map(() => '?').join(',')})`; params.push(...eventTypes); }
      sql += ' ORDER BY distance_ms ASC LIMIT ?'; params.push(limit);
      return all(sql, params);
    },
    findEventsNearEvent(eventId, windowMs, options = {}) {
      const ev = get('SELECT * FROM events WHERE id = ?', [eventId]);
      if (!ev || ev.sort_date == null) return [];
      return handlers.findEventsNearDate(ev.sort_date, windowMs, { excludePersonId: ev.person_id, ...options });
    },
    getGraphData() {
      function extractYear(dateStr) { if (!dateStr) return ''; const m = dateStr.match(/\b(\d{4})\b/); return m ? m[1] : ''; }
      const people = all(`SELECT p.*, (SELECT e.date FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1) AS birth_date, (SELECT e.place FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1) AS birth_place, (SELECT e.date FROM events e WHERE e.person_id = p.id AND e.type = 'death' LIMIT 1) AS death_date, (SELECT e.place FROM events e WHERE e.person_id = p.id AND e.type = 'death' LIMIT 1) AS death_place FROM people p ORDER BY p.surname, p.given_name`);
      const relationships = all('SELECT * FROM relationships');
      const nodeMap = {};
      for (const p of people) { const by = extractYear(p.birth_date); const dy = extractYear(p.death_date); const ly = (by || dy) ? `${by || '?'} – ${dy || ''}` : ''; nodeMap[p.id] = { id: p.id, data: { given_name: p.given_name, surname: p.surname, gender: p.gender, birth_date: p.birth_date || '', birth_place: p.birth_place || '', death_date: p.death_date || '', death_place: p.death_place || '', life_years: ly }, rels: { spouses: [], children: [], father: null, mother: null } }; }
      for (const rel of relationships) {
        if (rel.type === 'partner') { nodeMap[rel.person_a_id]?.rels.spouses.push(rel.person_b_id); nodeMap[rel.person_b_id]?.rels.spouses.push(rel.person_a_id); }
        else if (rel.type === 'parent_child') { const parent = nodeMap[rel.person_a_id]; const child = nodeMap[rel.person_b_id]; if (parent && child) { if (parent.data.gender === 'F') { child.rels.mother = rel.person_a_id; } else { child.rels.father = rel.person_a_id; } parent.rels.children.push(rel.person_b_id); } }
      }
      return Object.values(nodeMap);
    },
    bulkImport({ people, relationships, events, sources, participants }) {
      return transaction(() => {
        let counts = { people: 0, relationships: 0, events: 0, sources: 0, participants: 0 }; const now = Date.now();
        for (const p of (people || [])) { run(`INSERT OR REPLACE INTO people (id, given_name, surname, gender, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, [p.id, p.given_name||'', p.surname||'', p.gender||'U', p.notes||'', now, now]); counts.people++; }
        for (const r of (relationships || [])) { run(`INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at) VALUES (?, ?, ?, ?, ?)`, [r.id, r.person_a_id, r.person_b_id, r.type, now]); counts.relationships++; }
        for (const e of (events || [])) { run(`INSERT OR REPLACE INTO events (id, person_id, type, date, place, notes, sort_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [e.id, e.person_id, e.type||'other', e.date||'', e.place||'', e.notes||'', e.sort_date||null, now, now]); counts.events++; }
        for (const s of (sources || [])) { run(`INSERT OR REPLACE INTO sources (id, event_id, title, url, accessed, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [s.id, s.event_id, s.title||'', s.url||'', s.accessed||'', s.notes||'', now, now]); counts.sources++; }
        for (const ep of (participants || [])) { run(`INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)`, [ep.id, ep.event_id, ep.person_id, ep.role||'witness', now]); counts.participants++; }
        return counts;
      });
    },
    exportAll() {
      return { people: all('SELECT * FROM people ORDER BY created_at'), relationships: all('SELECT * FROM relationships ORDER BY created_at'), events: all('SELECT * FROM events ORDER BY person_id, sort_date'), sources: all('SELECT * FROM sources ORDER BY event_id, created_at'), participants: all('SELECT * FROM event_participants ORDER BY event_id') };
    },
    getStats() {
      return { people: get('SELECT COUNT(*) as n FROM people').n, events: get('SELECT COUNT(*) as n FROM events').n, sources: get('SELECT COUNT(*) as n FROM sources').n, relationships: get('SELECT COUNT(*) as n FROM relationships').n };
    },
    exportDatabase() {
      const tmp = new sqlite3Api.oo1.DB(':memory:');
      const tables = all("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL");
      const indexes = all("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
      for (const t of tables) tmp.exec(t.sql);
      for (const i of indexes) tmp.exec(i.sql);
      const tableNames = all("SELECT name FROM sqlite_master WHERE type='table'");
      for (const { name } of tableNames) { const rows = all(`SELECT * FROM "${name}"`); if (rows.length === 0) continue; const cols = Object.keys(rows[0]); const placeholders = cols.map(() => '?').join(','); const insertSql = `INSERT INTO "${name}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`; for (const row of rows) { tmp.exec({ sql: insertSql, bind: cols.map(c => row[c]) }); } }
      const bytes = sqlite3Api.capi.sqlite3_js_db_export(tmp.pointer);
      tmp.close();
      return bytes;
    },
  };
  return handlers;
}

// ─── Migrations ───────────────────────────────────────────────────────────────

const migrations = [];

function applyMigrations() {
  const { get, run } = helpers;
  const currentRow = get("SELECT value FROM meta WHERE key = 'schema_version'");
  const currentVersion = currentRow ? parseInt(currentRow.value, 10) : 1;

  const pending = migrations.filter(m => m.version > currentVersion);
  if (pending.length === 0) return;

  pending.sort((a, b) => a.version - b.version);

  db.exec('BEGIN');
  try {
    for (const m of pending) {
      console.log(`[worker] Running migration v${m.version}: ${m.description}`);
      m.up();
      run("UPDATE meta SET value = ? WHERE key = 'schema_version'", [String(m.version)]);
    }
    db.exec('COMMIT');
    console.log(`[worker] Migrations complete — now at v${pending[pending.length - 1].version}`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('[worker] Migration failed, rolled back:', e);
    throw e;
  }
}

// ─── Queue & Message Handler ──────────────────────────────────────────────────

const queue = [];
let running = false;

async function runNext() {
  if (running || queue.length === 0) return;
  running = true;
  const { fn, resolve, reject } = queue.shift();
  try { resolve(await fn()); } catch (e) { reject(e); } finally { running = false; runNext(); }
}

function enqueue(fn) {
  return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); runNext(); });
}

self.onmessage = async (e) => {
  const { id, method, args } = e.data;
  try {
    if (method === 'init') {
      await initDB();
      self.postMessage({ id, result: { ok: true } });
      return;
    }
    const result = await enqueue(() => handlers[method](...(args || [])));
    if (result instanceof Uint8Array) {
      self.postMessage({ id, result }, [result.buffer]);
    } else {
      self.postMessage({ id, result });
    }
  } catch (error) {
    self.postMessage({ id, error: error.message || String(error) });
  }
};
