/**
 * db/worker.js — Module worker for SQLite WASM with OPFS storage.
 *
 * Imports handler logic from handlers.js (no more duplication).
 * Handles: WASM init, OPFS setup, message queue, migrations.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { createHandlers } from './handlers.js';
import { applyMigrations } from './migrations.js';

let db = null;
let sqlite3Api = null;
let handlers = null;
let helpers = null;
let schemaBaseUrl = '';

async function initDB() {
  const sqlite3 = await sqlite3InitModule({
    printErr: console.error,
  });

  sqlite3Api = sqlite3;

  // Try OPFS SAH pool VFS, then legacy OPFS, then in-memory
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

  // Apply base schema
  const schemaResponse = await fetch(schemaBaseUrl + 'schema.sql');
  const schema = await schemaResponse.text();
  db.exec(schema);

  // Create helpers and handlers
  helpers = createWasmHelpers(db);
  handlers = createHandlers(helpers);

  // Add worker-only handlers that need WASM API access
  handlers.exportDatabase = () => {
    const tmp = new sqlite3Api.oo1.DB(':memory:');
    const tables = helpers.all("SELECT sql FROM sqlite_master WHERE type='table' AND sql IS NOT NULL");
    const indexes = helpers.all("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL");
    for (const t of tables) tmp.exec(t.sql);
    for (const i of indexes) tmp.exec(i.sql);
    const tableNames = helpers.all("SELECT name FROM sqlite_master WHERE type='table'");
    for (const { name } of tableNames) {
      const rows = helpers.all(`SELECT * FROM "${name}"`);
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      const placeholders = cols.map(() => '?').join(',');
      const insertSql = `INSERT INTO "${name}" (${cols.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;
      for (const row of rows) {
        tmp.exec({ sql: insertSql, bind: cols.map(c => row[c]) });
      }
    }
    const bytes = sqlite3Api.capi.sqlite3_js_db_export(tmp.pointer);
    tmp.close();
    return bytes;
  };

  handlers.nukeDatabase = async () => {
    helpers.run('DROP TABLE IF EXISTS citations');
    helpers.run('DROP TABLE IF EXISTS sources');
    helpers.run('DROP TABLE IF EXISTS repositories');
    helpers.run('DROP TABLE IF EXISTS event_participants');
    helpers.run('DROP TABLE IF EXISTS events');
    helpers.run('DROP TABLE IF EXISTS relationships');
    helpers.run('DROP TABLE IF EXISTS people');
    helpers.run('DROP TABLE IF EXISTS places');
    helpers.run("UPDATE meta SET value = '1' WHERE key = 'schema_version'");

    // Re-apply schema and migrations
    const schemaResponse = await fetch(schemaBaseUrl + 'schema.sql');
    const schemaText = await schemaResponse.text();
    db.exec(schemaText);
    applyMigrations(helpers);

    return { ok: true };
  };

  // Run migrations
  applyMigrations(helpers);
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
      schemaBaseUrl = args?.[0] || '';
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
