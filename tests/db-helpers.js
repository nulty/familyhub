/**
 * Test harness: creates an in-memory SQLite DB via better-sqlite3
 * and provides helpers matching the interface used by handlers.js.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { createHandlers } from '../src/db/handlers.js';
import { applyMigrations, migrations } from '../src/db/migrations.js';

/**
 * Creates a test DB with the current (v3) schema — loads schema.sql and applies all migrations.
 */
export function setupTestDB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync('public/schema.sql', 'utf-8');
  db.exec(schema);

  const helpers = createBetterSqliteHelpers(db);

  // Apply migrations (same as worker does on boot)
  applyMigrations(helpers);

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
 * Run migration v3 against a DB — delegates to shared migrations module.
 */
export function applyMigrationV3(helpers) {
  const v3 = migrations.find(m => m.version === 3);
  v3.up(helpers);
  helpers.run("UPDATE meta SET value = '3' WHERE key = 'schema_version'");
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
