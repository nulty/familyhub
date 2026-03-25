/**
 * Test harness: creates an in-memory SQLite DB via better-sqlite3
 * and provides helpers matching the interface used by handlers.js.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { createHandlers } from '../src/db/handlers.js';

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

  const helpers = createBetterSqliteHelpers(db);
  const handlers = createHandlers(helpers);

  return { db, handlers, helpers };
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
