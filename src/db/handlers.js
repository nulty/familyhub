/**
 * db/handlers.js
 * SQL handler functions extracted from worker.js for testability.
 * All handlers use injected helpers (all, get, run, transaction) rather
 * than module-level state, so they can be tested with better-sqlite3.
 */

/**
 * Create SQL helpers that work with SQLite WASM's db.exec() API.
 * For testing with better-sqlite3, use createBetterSqliteHelpers instead.
 */
export function createWasmHelpers(db) {
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

/**
 * Create the handlers object using injected SQL helpers.
 * @param {{ all, get, run, transaction }} h - SQL helper functions
 * @param {Object} [opts] - Optional extras (e.g. sqlite3Api for exportDatabase)
 */
export function createHandlers(h, opts = {}) {
  const { all, get, run, transaction } = h;

  function extractYear(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/\b(\d{4})\b/);
    return m ? m[1] : '';
  }

  const handlers = {

    // ── People ──────────────────────────────────────────────────────────────

    createPerson({ id, given_name = '', surname = '', gender = 'U', notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO people (id, given_name, surname, gender, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, given_name, surname, gender, notes, now, now]
      );
      return get('SELECT * FROM people WHERE id = ?', [id]);
    },

    getPerson(id) {
      return get('SELECT * FROM people WHERE id = ?', [id]);
    },

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

    deletePerson(id) {
      run('DELETE FROM people WHERE id = ?', [id]);
      return { ok: true };
    },

    searchPeople(query) {
      if (!query || query.trim() === '') {
        return all('SELECT * FROM people ORDER BY surname, given_name LIMIT 100');
      }
      const q = `%${query}%`;
      return all(
        `SELECT * FROM people
         WHERE given_name LIKE ? OR surname LIKE ? OR (given_name || ' ' || surname) LIKE ?
         ORDER BY surname, given_name LIMIT 50`,
        [q, q, q]
      );
    },

    getPersonWithEvents(id) {
      const person = get('SELECT * FROM people WHERE id = ?', [id]);
      if (!person) return null;
      const events = all(
        `SELECT e.*,
          (SELECT json_group_array(json_object(
            'id', c.id, 'source_id', c.source_id, 'detail', c.detail, 'url', c.url,
            'accessed', c.accessed, 'confidence', c.confidence,
            'source_title', s.title, 'source_url', s.url,
            'repository_name', COALESCE(r.name, '')
          )) FROM citations c
            JOIN sources s ON s.id = c.source_id
            LEFT JOIN repositories r ON r.id = s.repository_id
            WHERE c.event_id = e.id) as citations_json,
          (SELECT json_group_array(json_object(
            'person_id', ep.person_id, 'role', ep.role,
            'name', p.given_name || ' ' || p.surname
          )) FROM event_participants ep JOIN people p ON p.id = ep.person_id WHERE ep.event_id = e.id) as participants_json
         FROM events e WHERE e.person_id = ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [id]
      );
      for (const ev of events) {
        ev.citations = JSON.parse(ev.citations_json || '[]');
        ev.participants = JSON.parse(ev.participants_json || '[]');
        delete ev.citations_json;
        delete ev.participants_json;
      }
      const participatingEvents = all(
        `SELECT e.*, ep.role AS participant_role,
          owner.given_name || ' ' || owner.surname AS owner_name, owner.id AS owner_id,
          (SELECT json_group_array(json_object(
            'id', c.id, 'source_id', c.source_id, 'detail', c.detail, 'url', c.url,
            'accessed', c.accessed, 'confidence', c.confidence,
            'source_title', s.title, 'source_url', s.url,
            'repository_name', COALESCE(r.name, '')
          )) FROM citations c
            JOIN sources s ON s.id = c.source_id
            LEFT JOIN repositories r ON r.id = s.repository_id
            WHERE c.event_id = e.id) as citations_json
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         JOIN people owner ON owner.id = e.person_id
         WHERE ep.person_id = ? AND e.person_id != ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [id, id]
      );
      for (const ev of participatingEvents) {
        ev.citations = JSON.parse(ev.citations_json || '[]');
        delete ev.citations_json;
      }
      const family = handlers.getFamily(id);
      return { person, events, participatingEvents, ...family };
    },

    // ── Relationships ────────────────────────────────────────────────────────

    addPartner(id, personAId, personBId) {
      const now = Date.now();
      run(
        `INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at)
         VALUES (?, ?, ?, 'partner', ?)`,
        [id, personAId, personBId, now]
      );
      return get('SELECT * FROM relationships WHERE id = ?', [id]);
    },

    addParentChild(id, parentId, childId) {
      const now = Date.now();
      run(
        `INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at)
         VALUES (?, ?, ?, 'parent_child', ?)`,
        [id, parentId, childId, now]
      );
      return get('SELECT * FROM relationships WHERE id = ?', [id]);
    },

    removeRelationship(id) {
      run('DELETE FROM relationships WHERE id = ?', [id]);
      return { ok: true };
    },

    getFamily(personId) {
      const parents = all(
        `SELECT p.*, r.id as rel_id FROM people p
         JOIN relationships r ON r.person_a_id = p.id
         WHERE r.person_b_id = ? AND r.type = 'parent_child'`,
        [personId]
      );
      const children = all(
        `SELECT p.*, r.id as rel_id FROM people p
         JOIN relationships r ON r.person_b_id = p.id
         WHERE r.person_a_id = ? AND r.type = 'parent_child'`,
        [personId]
      );
      const partners = all(
        `SELECT p.*, r.id as rel_id FROM people p
         JOIN relationships r ON (r.person_a_id = ? AND r.person_b_id = p.id)
                              OR (r.person_b_id = ? AND r.person_a_id = p.id)
         WHERE r.type = 'partner'`,
        [personId, personId]
      );
      return { parents, children, partners };
    },

    // ── Events ───────────────────────────────────────────────────────────────

    createEvent({ id, person_id, type = 'other', date = '', place = '', place_id = null, notes = '', sort_date = null }) {
      const now = Date.now();
      run(
        `INSERT INTO events (id, person_id, type, date, place, place_id, notes, sort_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, person_id, type, date, place, place_id, notes, sort_date, now, now]
      );
      return get('SELECT * FROM events WHERE id = ?', [id]);
    },

    updateEvent(id, fields) {
      const allowed = ['type', 'date', 'place', 'place_id', 'notes', 'sort_date'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM events WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE events SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM events WHERE id = ?', [id]);
    },

    deleteEvent(id) {
      run('DELETE FROM events WHERE id = ?', [id]);
      return { ok: true };
    },

    listEvents(personId) {
      return all(
        'SELECT * FROM events WHERE person_id = ? ORDER BY COALESCE(sort_date, 9999999999999)',
        [personId]
      );
    },

    addParticipant({ id, event_id, person_id, role = 'witness' }) {
      const now = Date.now();
      run(
        `INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [id, event_id, person_id, role, now]
      );
      return { id, event_id, person_id, role };
    },

    removeParticipant(eventId, personId) {
      run('DELETE FROM event_participants WHERE event_id = ? AND person_id = ?', [eventId, personId]);
      return { ok: true };
    },

    getEventsForParticipant(personId) {
      return all(
        `SELECT e.*, ep.role, p.given_name || ' ' || p.surname AS owner_name, p.id AS owner_id
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         JOIN people p ON p.id = e.person_id
         WHERE ep.person_id = ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [personId]
      );
    },

    getParticipantsForEvent(eventId) {
      return all(
        `SELECT ep.id, ep.role, ep.person_id, ep.created_at, p.given_name, p.surname, p.gender
         FROM event_participants ep JOIN people p ON p.id = ep.person_id
         WHERE ep.event_id = ?
         ORDER BY ep.created_at`,
        [eventId]
      );
    },

    updateParticipantRole(eventId, personId, role) {
      run(
        'UPDATE event_participants SET role = ? WHERE event_id = ? AND person_id = ?',
        [role, eventId, personId]
      );
      return get(
        'SELECT * FROM event_participants WHERE event_id = ? AND person_id = ?',
        [eventId, personId]
      );
    },

    // ── Repositories ────────────────────────────────────────────────────────

    createRepository({ id, name = '', type = '', url = '', address = '', notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO repositories (id, name, type, url, address, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, type, url, address, notes, now, now]
      );
      return get('SELECT * FROM repositories WHERE id = ?', [id]);
    },

    getRepository(id) {
      return get('SELECT * FROM repositories WHERE id = ?', [id]);
    },

    updateRepository(id, fields) {
      const allowed = ['name', 'type', 'url', 'address', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM repositories WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE repositories SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM repositories WHERE id = ?', [id]);
    },

    deleteRepository(id) {
      run('DELETE FROM repositories WHERE id = ?', [id]);
      return { ok: true };
    },

    listRepositories() {
      return all('SELECT * FROM repositories ORDER BY name');
    },

    searchRepositories(query) {
      if (!query || query.trim() === '') return [];
      const q = `%${query}%`;
      return all(
        `SELECT * FROM repositories WHERE name LIKE ? OR url LIKE ? ORDER BY name LIMIT 20`,
        [q, q]
      );
    },

    // ── Sources ──────────────────────────────────────────────────────────────

    createSource({ id, repository_id = null, title = '', type = '', url = '', author = '', publisher = '', year = '', notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO sources (id, repository_id, title, type, url, author, publisher, year, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, repository_id, title, type, url, author, publisher, year, notes, now, now]
      );
      return get('SELECT * FROM sources WHERE id = ?', [id]);
    },

    getSource(id) {
      return get(
        `SELECT s.*, r.name AS repository_name
         FROM sources s LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE s.id = ?`,
        [id]
      );
    },

    updateSource(id, fields) {
      const allowed = ['repository_id', 'title', 'type', 'url', 'author', 'publisher', 'year', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM sources WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE sources SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM sources WHERE id = ?', [id]);
    },

    deleteSource(id) {
      run('DELETE FROM sources WHERE id = ?', [id]);
      return { ok: true };
    },

    listSources() {
      return all(
        `SELECT s.*, r.name AS repository_name
         FROM sources s LEFT JOIN repositories r ON r.id = s.repository_id
         ORDER BY s.title`
      );
    },

    searchSources(query) {
      if (!query || query.trim() === '') return [];
      const q = `%${query}%`;
      return all(
        `SELECT s.*, r.name AS repository_name
         FROM sources s LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE s.title LIKE ? OR s.url LIKE ?
         ORDER BY s.title LIMIT 20`,
        [q, q]
      );
    },

    listSourcesForEvent(eventId) {
      return all(
        `SELECT DISTINCT s.*, r.name AS repository_name
         FROM citations c
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE c.event_id = ?
         ORDER BY s.title`,
        [eventId]
      );
    },

    // ── Citations ─────────────────────────────────────────────────────────────

    createCitation({ id, source_id, event_id, detail = '', url = '', accessed = '', confidence = '', notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, source_id, event_id, detail, url, accessed, confidence, notes, now, now]
      );
      return get('SELECT * FROM citations WHERE id = ?', [id]);
    },

    getCitation(id) {
      return get('SELECT * FROM citations WHERE id = ?', [id]);
    },

    updateCitation(id, fields) {
      const allowed = ['source_id', 'detail', 'url', 'accessed', 'confidence', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM citations WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE citations SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM citations WHERE id = ?', [id]);
    },

    deleteCitation(id) {
      run('DELETE FROM citations WHERE id = ?', [id]);
      return { ok: true };
    },

    listCitationsForEvent(eventId) {
      return all(
        `SELECT c.*, s.title AS source_title, s.url AS source_url, s.type AS source_type,
                r.name AS repository_name, r.id AS repository_id
         FROM citations c
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE c.event_id = ?
         ORDER BY c.created_at`,
        [eventId]
      );
    },

    listCitationsForSource(sourceId) {
      return all(
        `SELECT c.*, e.type AS event_type, e.date AS event_date, e.place AS event_place,
                e.person_id, p.given_name, p.surname
         FROM citations c
         JOIN events e ON e.id = c.event_id
         JOIN people p ON p.id = e.person_id
         WHERE c.source_id = ?
         ORDER BY c.created_at`,
        [sourceId]
      );
    },

    // ── Places ──────────────────────────────────────────────────────────────

    createPlace({ id, name, type = '', parent_id = null, notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO places (id, name, type, parent_id, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, name, type, parent_id, notes, now, now]
      );
      return get('SELECT * FROM places WHERE id = ?', [id]);
    },

    getPlace(id) {
      return get('SELECT * FROM places WHERE id = ?', [id]);
    },

    updatePlace(id, fields) {
      const allowed = ['name', 'type', 'parent_id', 'notes'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM places WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE places SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM places WHERE id = ?', [id]);
    },

    deletePlace(id) {
      run('DELETE FROM places WHERE id = ?', [id]);
      return { ok: true };
    },

    listPlaces() {
      return all('SELECT * FROM places ORDER BY name');
    },

    getPlaceTree() {
      return all('SELECT * FROM places ORDER BY name');
    },

    findPlaceByNameTypeParent(name, type, parentId) {
      if (parentId) {
        return get(
          'SELECT * FROM places WHERE name = ? AND type = ? AND parent_id = ?',
          [name, type, parentId]
        );
      }
      return get(
        'SELECT * FROM places WHERE name = ? AND type = ? AND parent_id IS NULL',
        [name, type]
      );
    },

    searchPlaces(query) {
      if (!query || query.trim() === '') return [];
      const q = `%${query}%`;
      const results = all(
        `SELECT * FROM places WHERE name LIKE ? AND type != '' ORDER BY name LIMIT 20`,
        [q]
      );
      for (const r of results) {
        const chain = handlers.getPlaceHierarchy(r.id);
        r.full_name = chain.map(p => p.name).reverse().join(', ');
      }
      return results;
    },

    getPlaceHierarchy(id) {
      const chain = [];
      let currentId = id;
      const visited = new Set();
      while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const place = get('SELECT * FROM places WHERE id = ?', [currentId]);
        if (!place) break;
        chain.unshift(place);
        currentId = place.parent_id;
      }
      return chain;
    },

    getPeopleByPlace(placeIdOrName) {
      return all(
        `SELECT DISTINCT p.id, p.given_name, p.surname FROM people p
         JOIN events e ON e.person_id = p.id
         WHERE e.place_id = ? OR e.place LIKE ?
         ORDER BY p.surname, p.given_name LIMIT 10`,
        [placeIdOrName, `%${placeIdOrName}%`]
      );
    },

    getEventsByPlace(placeId) {
      return all(
        `SELECT e.*, p.given_name, p.surname, p.id AS person_id
         FROM events e
         JOIN people p ON p.id = e.person_id
         WHERE e.place_id = ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [placeId]
      );
    },

    getPlaceChildren(parentId) {
      if (!parentId) {
        return all('SELECT * FROM places WHERE parent_id IS NULL ORDER BY name');
      }
      return all('SELECT * FROM places WHERE parent_id = ? ORDER BY name', [parentId]);
    },

    // ── Temporal queries ─────────────────────────────────────────────────────

    findEventsNearDate(targetMs, windowMs, options = {}) {
      const { excludePersonId, personIds, eventTypes, limit = 100 } = options;
      const lo = targetMs - windowMs;
      const hi = targetMs + windowMs;

      let sql = `SELECT e.*, p.given_name, p.surname, p.gender, ABS(e.sort_date - ?) AS distance_ms
                 FROM events e JOIN people p ON p.id = e.person_id
                 WHERE e.sort_date BETWEEN ? AND ?`;
      const params = [targetMs, lo, hi];

      if (excludePersonId) {
        sql += ' AND e.person_id != ?';
        params.push(excludePersonId);
      }
      if (personIds && personIds.length > 0) {
        sql += ` AND e.person_id IN (${personIds.map(() => '?').join(',')})`;
        params.push(...personIds);
      }
      if (eventTypes && eventTypes.length > 0) {
        sql += ` AND e.type IN (${eventTypes.map(() => '?').join(',')})`;
        params.push(...eventTypes);
      }

      sql += ' ORDER BY distance_ms ASC LIMIT ?';
      params.push(limit);

      return all(sql, params);
    },

    findEventsNearEvent(eventId, windowMs, options = {}) {
      const ev = get('SELECT * FROM events WHERE id = ?', [eventId]);
      if (!ev || ev.sort_date == null) return [];
      return handlers.findEventsNearDate(ev.sort_date, windowMs, {
        excludePersonId: ev.person_id,
        ...options,
      });
    },

    // ── Graph data ───────────────────────────────────────────────────────────

    getGraphData() {
      const people = all(`SELECT p.*,
          (SELECT e.date FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1) AS birth_date,
          (SELECT e.place FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1) AS birth_place,
          (SELECT e.date FROM events e WHERE e.person_id = p.id AND e.type = 'death' LIMIT 1) AS death_date,
          (SELECT e.place FROM events e WHERE e.person_id = p.id AND e.type = 'death' LIMIT 1) AS death_place
        FROM people p ORDER BY p.surname, p.given_name`);
      const relationships = all('SELECT * FROM relationships');

      const nodeMap = {};
      for (const p of people) {
        const birthYear = extractYear(p.birth_date);
        const deathYear = extractYear(p.death_date);
        let lifeYears = '';
        if (birthYear || deathYear) {
          lifeYears = `${birthYear || '?'} – ${deathYear || ''}`;
        }
        nodeMap[p.id] = {
          id: p.id,
          data: {
            given_name: p.given_name, surname: p.surname, gender: p.gender,
            birth_date: p.birth_date || '', birth_place: p.birth_place || '',
            death_date: p.death_date || '', death_place: p.death_place || '',
            life_years: lifeYears,
          },
          rels: { spouses: [], children: [], father: null, mother: null },
        };
      }

      for (const rel of relationships) {
        if (rel.type === 'partner') {
          nodeMap[rel.person_a_id]?.rels.spouses.push(rel.person_b_id);
          nodeMap[rel.person_b_id]?.rels.spouses.push(rel.person_a_id);
        } else if (rel.type === 'parent_child') {
          const parent = nodeMap[rel.person_a_id];
          const child = nodeMap[rel.person_b_id];
          if (parent && child) {
            if (parent.data.gender === 'F') {
              child.rels.mother = rel.person_a_id;
            } else {
              child.rels.father = rel.person_a_id;
            }
            parent.rels.children.push(rel.person_b_id);
          }
        }
      }

      return Object.values(nodeMap);
    },

    // ── Bulk import (for GEDCOM) ─────────────────────────────────────────────

    bulkImport({ people, relationships, events, sources, repositories, citations, participants, places }) {
      return transaction(() => {
        let counts = { people: 0, relationships: 0, events: 0, repositories: 0, sources: 0, citations: 0, participants: 0, places: 0 };
        const now = Date.now();

        for (const p of (people || [])) {
          run(
            `INSERT OR REPLACE INTO people (id, given_name, surname, gender, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [p.id, p.given_name||'', p.surname||'', p.gender||'U', p.notes||'', now, now]
          );
          counts.people++;
        }

        for (const r of (relationships || [])) {
          run(
            `INSERT OR IGNORE INTO relationships (id, person_a_id, person_b_id, type, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [r.id, r.person_a_id, r.person_b_id, r.type, now]
          );
          counts.relationships++;
        }

        // Places must be inserted before events (events reference place_id)
        for (const pl of (places || [])) {
          run(
            `INSERT OR IGNORE INTO places (id, name, type, parent_id, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [pl.id, pl.name||'', pl.type||'', pl.parent_id||null, pl.notes||'', now, now]
          );
          counts.places++;
        }

        for (const e of (events || [])) {
          run(
            `INSERT OR REPLACE INTO events (id, person_id, type, date, place, place_id, notes, sort_date, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [e.id, e.person_id, e.type||'other', e.date||'', e.place||'', e.place_id||null, e.notes||'', e.sort_date||null, now, now]
          );
          counts.events++;
        }

        // Repositories must be inserted before sources (sources reference repository_id)
        for (const repo of (repositories || [])) {
          run(
            `INSERT OR REPLACE INTO repositories (id, name, type, url, address, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [repo.id, repo.name||'', repo.type||'', repo.url||'', repo.address||'', repo.notes||'', now, now]
          );
          counts.repositories++;
        }

        for (const s of (sources || [])) {
          run(
            `INSERT OR REPLACE INTO sources (id, repository_id, title, type, url, author, publisher, year, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [s.id, s.repository_id||null, s.title||'', s.type||'', s.url||'', s.author||'', s.publisher||'', s.year||'', s.notes||'', now, now]
          );
          counts.sources++;
        }

        // Citations must be inserted after sources and events
        for (const c of (citations || [])) {
          run(
            `INSERT OR REPLACE INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.id, c.source_id, c.event_id, c.detail||'', c.url||'', c.accessed||'', c.confidence||'', c.notes||'', now, now]
          );
          counts.citations++;
        }

        for (const ep of (participants || [])) {
          run(
            `INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [ep.id, ep.event_id, ep.person_id, ep.role||'witness', now]
          );
          counts.participants++;
        }

        return counts;
      });
    },

    // ── Full export (for GEDCOM export) ─────────────────────────────────────

    exportAll() {
      return {
        people:        all('SELECT * FROM people ORDER BY created_at'),
        relationships: all('SELECT * FROM relationships ORDER BY created_at'),
        events:        all('SELECT * FROM events ORDER BY person_id, sort_date'),
        repositories:  all('SELECT * FROM repositories ORDER BY name'),
        sources:       all('SELECT * FROM sources ORDER BY title'),
        citations:     all('SELECT * FROM citations ORDER BY event_id, created_at'),
        participants:  all('SELECT * FROM event_participants ORDER BY event_id'),
        places:        all('SELECT * FROM places ORDER BY name'),
      };
    },

    // ── Reset ────────────────────────────────────────────────────────────────

    resetDatabase() {
      run('DROP TABLE IF EXISTS citations');
      run('DROP TABLE IF EXISTS sources');
      run('DROP TABLE IF EXISTS repositories');
      run('DROP TABLE IF EXISTS event_participants');
      run('DROP TABLE IF EXISTS events');
      run('DROP TABLE IF EXISTS relationships');
      run('DROP TABLE IF EXISTS people');
      run('DROP TABLE IF EXISTS places');
      run("UPDATE meta SET value = '1' WHERE key = 'schema_version'");
      return { ok: true };
    },

    // ── Stats ────────────────────────────────────────────────────────────────

    getStats() {
      return {
        people:        get('SELECT COUNT(*) as n FROM people').n,
        events:        get('SELECT COUNT(*) as n FROM events').n,
        repositories:  get('SELECT COUNT(*) as n FROM repositories').n,
        sources:       get('SELECT COUNT(*) as n FROM sources').n,
        citations:     get('SELECT COUNT(*) as n FROM citations').n,
        relationships: get('SELECT COUNT(*) as n FROM relationships').n,
        places:        get('SELECT COUNT(*) as n FROM places').n,
      };
    },
  };

  return handlers;
}
