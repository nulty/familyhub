/**
 * Test harness: creates an in-memory SQLite DB via better-sqlite3
 * and provides helpers matching the interface used by handlers.js.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { createHandlers } from '../src/db/handlers.js';

/**
 * Creates a test DB with the current schema — loads schema.sql directly.
 */
export function setupTestDB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync('public/schema.sql', 'utf-8');
  db.exec(schema);

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
