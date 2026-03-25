/**
 * Test harness: creates an in-memory SQLite DB via better-sqlite3
 * and provides helpers matching the interface used by handlers.js.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { createHandlers } from '../src/db/handlers.js';

/**
 * Creates a test DB with the current (v3) schema — loads schema.sql and applies all migrations.
 */
export function setupTestDB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync('public/schema.sql', 'utf-8');
  db.exec(schema);

  // Apply migrations (same as worker does on boot)
  // v2: add place_id to events
  const cols = db.prepare("PRAGMA table_info(events)").all();
  if (!cols.some(c => c.name === 'place_id')) {
    db.exec('ALTER TABLE events ADD COLUMN place_id TEXT REFERENCES places(id) ON DELETE SET NULL');
  }

  // v3: repositories + new sources + citations (schema.sql already has new tables for fresh DBs)

  const helpers = createBetterSqliteHelpers(db);
  const handlers = createHandlers(helpers);

  return { db, handlers, helpers };
}

/**
 * Creates a test DB with the old v2 schema (before repositories/citations existed).
 * sources table has: id, event_id, title, url, accessed, notes, created_at, updated_at
 */
export function setupV2TestDB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    INSERT OR IGNORE INTO meta VALUES ('schema_version', '2');

    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY, given_name TEXT NOT NULL DEFAULT '', surname TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT 'U' CHECK(gender IN ('M','F','U')),
      notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS relationships (
      id TEXT PRIMARY KEY, person_a_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      person_b_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('partner','parent_child')),
      created_at INTEGER NOT NULL, UNIQUE(person_a_id, person_b_id, type));

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'other', date TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '',
      place_id TEXT, notes TEXT NOT NULL DEFAULT '', sort_date INTEGER,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS event_participants (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'witness', created_at INTEGER NOT NULL, UNIQUE(event_id, person_id));

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
      accessed TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_sources_event ON sources(event_id);

    CREATE TABLE IF NOT EXISTS places (
      id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','country','province','county','barony','civil_parish','church_parish','parish','townland','city','town','suburb','village','street','address','cemetery')),
      parent_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  `);

  const helpers = createBetterSqliteHelpers(db);
  return { db, helpers };
}

/**
 * Run migration v3 against a DB using the same logic as worker.js.
 * Extracted here so it can be tested with better-sqlite3.
 */
export function applyMigrationV3(helpers) {
  const { run, all, get } = helpers;
  const now = Date.now();

  const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function generateId() {
    let t = Date.now(), s = '';
    for (let i = 9; i >= 0; i--) { s = ULID_CHARS[t % 32] + s; t = Math.floor(t / 32); }
    const bytes = new Uint8Array(16);
    // Simple random for tests (no crypto.getRandomValues in Node test env)
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < 16; i++) s += ULID_CHARS[bytes[i] % 32];
    return s;
  }

  // Check current state of sources table to determine what work is needed
  const sourceCols = all("PRAGMA table_info(sources)");
  const hasOldSchema = sourceCols.some(c => c.name === 'event_id');
  const hasNewSchema = sourceCols.some(c => c.name === 'repository_id');

  // Also check if sources_old exists (partial previous run)
  const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
  const tableNames = tables.map(t => t.name);
  const hasSourcesOld = tableNames.includes('sources_old');

  // Read old data from wherever it lives
  let oldSources = [];
  if (hasOldSchema) {
    oldSources = all('SELECT * FROM sources');
  } else if (hasSourcesOld) {
    oldSources = all('SELECT * FROM sources_old');
  }

  // Step 1: Rename old sources if it still has the old schema
  if (hasOldSchema && !hasSourcesOld) {
    run('ALTER TABLE sources RENAME TO sources_old');
    run('DROP INDEX IF EXISTS idx_sources_event');
  } else if (hasOldSchema && hasSourcesOld) {
    run('DROP TABLE IF EXISTS sources');
    run('DROP INDEX IF EXISTS idx_sources_event');
  }

  // Step 2: Create repositories table
  run(`CREATE TABLE IF NOT EXISTS repositories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','archive','library','website','database','church','government','personal','other')),
    url TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  run('CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(name)');

  // Step 3: Create new sources table (depends on repositories)
  if (!hasNewSchema) {
    run(`CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
      title TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','document','register','census','webpage','book','newspaper','certificate','photograph','other')),
      url TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '',
      publisher TEXT NOT NULL DEFAULT '', year TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
    run('CREATE INDEX IF NOT EXISTS idx_sources_repo ON sources(repository_id)');
    run('CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title)');
  }

  // Step 4: Create citations table (depends on new sources + events)
  run(`CREATE TABLE IF NOT EXISTS citations (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    detail TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
    accessed TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT '' CHECK(confidence IN ('','primary','secondary','questionable')),
    notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  run('CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_id)');
  run('CREATE INDEX IF NOT EXISTS idx_citations_event ON citations(event_id)');

  // Step 5: Migrate old data (only if there is old data to migrate)
  if (oldSources.length > 0) {
    const repoMap = {};
    const sourceMap = {};

    for (const old of oldSources) {
      let repoId = null;

      if (old.url) {
        try {
          const u = new URL(old.url);
          const domain = u.hostname.replace(/^www\./, '');
          if (!repoMap[domain]) {
            repoMap[domain] = generateId();
            run('INSERT INTO repositories (id, name, type, url, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [repoMap[domain], domain, 'website', u.origin, '', '', now, now]);
          }
          repoId = repoMap[domain];
        } catch (e) { /* invalid URL, skip repo */ }
      }

      const sourceKey = `${repoId || ''}|${old.title || ''}`;
      if (!sourceMap[sourceKey] && (old.title || old.url)) {
        sourceMap[sourceKey] = generateId();
        const sourceType = old.url ? 'webpage' : '';
        run('INSERT INTO sources (id, repository_id, title, type, url, author, publisher, year, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [sourceMap[sourceKey], repoId, old.title || '', sourceType, old.url || '', '', '', '', old.notes || '', now, now]);
      }

      const newSourceId = sourceMap[sourceKey];
      if (newSourceId) {
        const citationId = generateId();
        run('INSERT INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [citationId, newSourceId, old.event_id, '', old.url || '', old.accessed || '', '', '', now, now]);
      }
    }
  }

  // Step 6: Clean up
  run('DROP TABLE IF EXISTS sources_old');

  run("UPDATE meta SET value = '3' WHERE key = 'schema_version'");
}

function createBetterSqliteHelpers(db) {
  function all(sql, params = []) {
    return db.prepare(sql).all(...params);
  }

  function get(sql, params = []) {
    return db.prepare(sql).get(...params) ?? null;
  }

  function run(sql, params = []) {
    return db.prepare(sql).run(...params).changes;
  }

  function transaction(fn) {
    const tx = db.transaction(fn);
    return tx();
  }

  return { all, get, run, transaction };
}
