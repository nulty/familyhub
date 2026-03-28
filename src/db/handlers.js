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
      const birthYearSub = `(SELECT SUBSTR(e.date, -4) FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1)`;
      if (!query || query.trim() === '') {
        return all(`SELECT p.*, ${birthYearSub} AS birth_year FROM people p ORDER BY p.surname, p.given_name LIMIT 100`);
      }
      const q = `%${query}%`;
      return all(
        `SELECT p.*, ${birthYearSub} AS birth_year FROM people p
         WHERE p.given_name LIKE ? OR p.surname LIKE ? OR (p.given_name || ' ' || p.surname) LIKE ?
         ORDER BY p.surname, p.given_name LIMIT 50`,
        [q, q, q]
      );
    },

    // ── Person Names ──────────────────────────────────────────────────────

    createPersonName({ id, person_id, given_name = '', surname = '', type = '', date = '', sort_order = 0 }) {
      const now = Date.now();
      run(
        `INSERT INTO person_names (id, person_id, given_name, surname, type, date, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, person_id, given_name, surname, type, date, sort_order, now, now]
      );
      return get('SELECT * FROM person_names WHERE id = ?', [id]);
    },

    updatePersonName(id, fields) {
      const allowed = ['given_name', 'surname', 'type', 'date', 'sort_order'];
      const updates = Object.entries(fields).filter(([k]) => allowed.includes(k));
      if (updates.length === 0) return get('SELECT * FROM person_names WHERE id = ?', [id]);
      const now = Date.now();
      const setClauses = [...updates.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ');
      const values = [...updates.map(([, v]) => v), now, id];
      run(`UPDATE person_names SET ${setClauses} WHERE id = ?`, values);
      return get('SELECT * FROM person_names WHERE id = ?', [id]);
    },

    deletePersonName(id) {
      run('DELETE FROM person_names WHERE id = ?', [id]);
      return { ok: true };
    },

    listPersonNames(personId) {
      return all('SELECT * FROM person_names WHERE person_id = ? ORDER BY sort_order, created_at', [personId]);
    },

    getPersonWithEvents(id) {
      const person = get('SELECT * FROM people WHERE id = ?', [id]);
      if (!person) return null;

      // Subquery fragments reused across queries
      const citationsSub = `(SELECT json_group_array(json_object(
            'id', c.id, 'source_id', c.source_id, 'detail', c.detail, 'url', c.url,
            'accessed', c.accessed, 'confidence', c.confidence,
            'source_title', s.title, 'source_url', s.url,
            'repository_name', COALESCE(r.name, '')
          )) FROM citation_events ce
            JOIN citations c ON c.id = ce.citation_id
            JOIN sources s ON s.id = c.source_id
            LEFT JOIN repositories r ON r.id = s.repository_id
            WHERE ce.event_id = e.id)`;
      const participantsSub = `(SELECT json_group_array(json_object(
            'person_id', ep2.person_id, 'role', ep2.role,
            'name', p2.given_name || ' ' || p2.surname
          )) FROM event_participants ep2 JOIN people p2 ON p2.id = ep2.person_id WHERE ep2.event_id = e.id)`;

      // 1. Owned events (person_id = this person)
      const ownedEvents = all(
        `SELECT e.*, ${citationsSub} as citations_json, ${participantsSub} as participants_json
         FROM events e WHERE e.person_id = ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [id]
      );
      for (const ev of ownedEvents) {
        ev.citations = JSON.parse(ev.citations_json || '[]');
        ev.participants = JSON.parse(ev.participants_json || '[]');
        delete ev.citations_json;
        delete ev.participants_json;
      }

      // 2. Shared events (person_id IS NULL, person is a participant)
      const sharedEvents = all(
        `SELECT e.*, ep.role AS participant_role,
          ${citationsSub} as citations_json, ${participantsSub} as participants_json
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         WHERE ep.person_id = ? AND e.person_id IS NULL
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [id]
      );
      for (const ev of sharedEvents) {
        ev.citations = JSON.parse(ev.citations_json || '[]');
        ev.participants = JSON.parse(ev.participants_json || '[]');
        delete ev.citations_json;
        delete ev.participants_json;
      }

      // 3. Participating events (someone else's owned event, person is a participant)
      const participatingEvents = all(
        `SELECT e.*, ep.role AS participant_role,
          owner.given_name || ' ' || owner.surname AS owner_name, owner.id AS owner_id,
          ${citationsSub} as citations_json
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         JOIN people owner ON owner.id = e.person_id
         WHERE ep.person_id = ? AND e.person_id IS NOT NULL AND e.person_id != ?
         ORDER BY COALESCE(e.sort_date, 9999999999999)`,
        [id, id]
      );
      for (const ev of participatingEvents) {
        ev.citations = JSON.parse(ev.citations_json || '[]');
        delete ev.citations_json;
      }

      const names = handlers.listPersonNames(id);
      const family = handlers.getFamily(id);
      return { person, names, events: ownedEvents, sharedEvents, participatingEvents, ...family };
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

    getEvent(id) {
      return get('SELECT * FROM events WHERE id = ?', [id]);
    },

    updateEvent(id, fields) {
      const allowed = ['type', 'date', 'place', 'place_id', 'notes', 'sort_date', 'person_id'];
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
        `SELECT e.*, ep.role,
          COALESCE(p.given_name || ' ' || p.surname, '') AS owner_name,
          e.person_id AS owner_id
         FROM event_participants ep
         JOIN events e ON e.id = ep.event_id
         LEFT JOIN people p ON p.id = e.person_id
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
         FROM citation_events ce
         JOIN citations c ON c.id = ce.citation_id
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE ce.event_id = ?
         ORDER BY s.title`,
        [eventId]
      );
    },

    // ── Citations ─────────────────────────────────────────────────────────────

    createCitation({ id, source_id, event_id, detail = '', url = '', accessed = '', confidence = '', notes = '' }) {
      const now = Date.now();
      run(
        `INSERT INTO citations (id, source_id, detail, url, accessed, confidence, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, source_id, detail, url, accessed, confidence, notes, now, now]
      );
      if (event_id) {
        run(`INSERT OR IGNORE INTO citation_events (citation_id, event_id) VALUES (?, ?)`, [id, event_id]);
      }
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

    linkCitationEvent(citationId, eventId) {
      run(`INSERT OR IGNORE INTO citation_events (citation_id, event_id) VALUES (?, ?)`, [citationId, eventId]);
      return { ok: true };
    },

    unlinkCitationEvent(citationId, eventId) {
      run(`DELETE FROM citation_events WHERE citation_id = ? AND event_id = ?`, [citationId, eventId]);
      return { ok: true };
    },

    searchCitations(query) {
      if (!query || !query.trim()) return [];
      const q = `%${query.trim()}%`;
      return all(
        `SELECT c.*, s.title AS source_title, s.url AS source_url,
                r.name AS repository_name,
                (SELECT GROUP_CONCAT(
                  e2.type || CASE WHEN e2.date != '' THEN ' (' || e2.date || ')' ELSE '' END
                  || CASE WHEN e2.place != '' THEN ' ' || e2.place ELSE '' END
                  || CASE WHEN p3.given_name IS NOT NULL THEN ' — ' || p3.given_name || ' ' || p3.surname ELSE '' END
                , '; ')
                 FROM citation_events ce2
                 JOIN events e2 ON e2.id = ce2.event_id
                 LEFT JOIN people p3 ON p3.id = e2.person_id
                 WHERE ce2.citation_id = c.id
                ) AS event_summary
         FROM citations c
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE c.id IN (
           SELECT c2.id FROM citations c2
           JOIN sources s2 ON s2.id = c2.source_id
           WHERE s2.title LIKE ? OR c2.detail LIKE ? OR c2.url LIKE ?
           UNION
           SELECT ce3.citation_id FROM citation_events ce3
           JOIN events e3 ON e3.id = ce3.event_id
           WHERE e3.place LIKE ?
           UNION
           SELECT ce4.citation_id FROM citation_events ce4
           JOIN events e4 ON e4.id = ce4.event_id
           LEFT JOIN people p4 ON p4.id = e4.person_id
           WHERE p4.given_name LIKE ? OR p4.surname LIKE ?
           UNION
           SELECT ce5.citation_id FROM citation_events ce5
           JOIN events e5 ON e5.id = ce5.event_id
           JOIN event_participants ep5 ON ep5.event_id = e5.id
           JOIN people p5 ON p5.id = ep5.person_id
           WHERE p5.given_name LIKE ? OR p5.surname LIKE ?
         )
         ORDER BY c.created_at DESC
         LIMIT 20`,
        [q, q, q, q, q, q, q, q]
      );
    },

    listCitationsForEvent(eventId) {
      return all(
        `SELECT c.*, s.title AS source_title, s.url AS source_url, s.type AS source_type,
                r.name AS repository_name, r.id AS repository_id
         FROM citation_events ce
         JOIN citations c ON c.id = ce.citation_id
         JOIN sources s ON s.id = c.source_id
         LEFT JOIN repositories r ON r.id = s.repository_id
         WHERE ce.event_id = ?
         ORDER BY c.created_at`,
        [eventId]
      );
    },

    listCitationsForSource(sourceId) {
      return all(
        `SELECT c.*, e.type AS event_type, e.date AS event_date, e.place AS event_place,
                e.person_id,
                CASE WHEN e.person_id IS NOT NULL THEN COALESCE(p.given_name, '') ELSE '' END AS given_name,
                CASE WHEN e.person_id IS NOT NULL THEN COALESCE(p.surname, '') ELSE '' END AS surname,
                CASE WHEN e.person_id IS NULL THEN
                  (SELECT GROUP_CONCAT(p2.given_name || ' ' || p2.surname, ', ')
                   FROM event_participants ep2
                   JOIN people p2 ON p2.id = ep2.person_id
                   WHERE ep2.event_id = e.id)
                ELSE NULL END AS participant_names
         FROM citations c
         LEFT JOIN citation_events ce ON ce.citation_id = c.id
         LEFT JOIN events e ON e.id = ce.event_id
         LEFT JOIN people p ON p.id = e.person_id
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
         WHERE p.id IN (
           SELECT e.person_id FROM events e WHERE (e.place_id = ? OR e.place LIKE ?) AND e.person_id IS NOT NULL
           UNION
           SELECT ep.person_id FROM event_participants ep JOIN events e ON e.id = ep.event_id WHERE e.place_id = ? OR e.place LIKE ?
         )
         ORDER BY p.surname, p.given_name LIMIT 10`,
        [placeIdOrName, `%${placeIdOrName}%`, placeIdOrName, `%${placeIdOrName}%`]
      );
    },

    getEventsByPlace(placeId) {
      return all(
        `SELECT e.*, COALESCE(p.given_name, '') AS given_name, COALESCE(p.surname, '') AS surname, e.person_id
         FROM events e
         LEFT JOIN people p ON p.id = e.person_id
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
                 FROM events e LEFT JOIN people p ON p.id = e.person_id
                 WHERE e.sort_date BETWEEN ? AND ?`;
      const params = [targetMs, lo, hi];

      if (excludePersonId) {
        sql += ' AND (e.person_id IS NULL OR e.person_id != ?)';
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

    bulkImport({ people, relationships, events, sources, repositories, citations, citation_events, participants, places, person_names }) {
      return transaction(() => {
        let counts = { people: 0, relationships: 0, events: 0, repositories: 0, sources: 0, citations: 0, participants: 0, places: 0, person_names: 0 };
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
            `INSERT OR REPLACE INTO citations (id, source_id, detail, url, accessed, confidence, notes, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [c.id, c.source_id, c.detail||'', c.url||'', c.accessed||'', c.confidence||'', c.notes||'', now, now]
          );
          if (c.event_id) {
            run(`INSERT OR IGNORE INTO citation_events (citation_id, event_id) VALUES (?, ?)`, [c.id, c.event_id]);
          }
          counts.citations++;
        }

        // Citation-event junction rows (from exportAll round-trips)
        for (const ce of (citation_events || [])) {
          run(`INSERT OR IGNORE INTO citation_events (citation_id, event_id) VALUES (?, ?)`, [ce.citation_id, ce.event_id]);
        }

        for (const ep of (participants || [])) {
          run(
            `INSERT OR IGNORE INTO event_participants (id, event_id, person_id, role, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [ep.id, ep.event_id, ep.person_id, ep.role||'witness', now]
          );
          counts.participants++;
        }

        for (const n of (person_names || [])) {
          run(
            `INSERT OR REPLACE INTO person_names (id, person_id, given_name, surname, type, date, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [n.id, n.person_id, n.given_name||'', n.surname||'', n.type||'', n.date||'', n.sort_order||0, now, now]
          );
          counts.person_names++;
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
        citations:       all('SELECT * FROM citations ORDER BY created_at'),
        citation_events: all('SELECT * FROM citation_events ORDER BY citation_id'),
        participants:    all('SELECT * FROM event_participants ORDER BY event_id'),
        places:        all('SELECT * FROM places ORDER BY name'),
        person_names:  all('SELECT * FROM person_names ORDER BY person_id, sort_order'),
      };
    },

    // ── Reset ────────────────────────────────────────────────────────────────

    resetDatabase() {
      run('DROP TABLE IF EXISTS person_names');
      run('DROP TABLE IF EXISTS citation_events');
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
