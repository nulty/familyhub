import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { applyMigrations, getPendingMigrations } from '../src/db/migrations.js';

function createV6DB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = OFF');

  // Load current schema (v7)
  const schema = readFileSync('public/schema.sql', 'utf-8');
  db.exec(schema);

  // Downgrade places table to v6 (no latitude/longitude)
  db.exec(`
    CREATE TABLE places_v6 (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT ''
        CHECK(type IN ('','country','province','county','barony','civil_parish','church_parish','parish','townland','city','town','suburb','village','street','address','cemetery')),
      parent_id TEXT REFERENCES places(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    INSERT INTO places_v6 SELECT id, name, type, parent_id, notes, created_at, updated_at FROM places;
    DROP TABLE places;
    ALTER TABLE places_v6 RENAME TO places;
    UPDATE meta SET value = '6' WHERE key = 'schema_version';
  `);

  db.pragma('foreign_keys = ON');

  const helpers = {
    all(sql, params = []) { return db.prepare(sql).all(...params); },
    get(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    run(sql, params = []) { return db.prepare(sql).run(...params).changes; },
    transaction(fn) { return db.transaction(fn)(); },
  };

  return { db, helpers };
}

describe('Migration v7: Add latitude/longitude to places', () => {
  it('detects pending migrations from v6 (v7 + v8)', () => {
    const { helpers } = createV6DB();
    const { currentVersion, pending } = getPendingMigrations(helpers);
    expect(currentVersion).toBe(6);
    expect(pending.length).toBeGreaterThanOrEqual(2);
    expect(pending[0].version).toBe(7);
    expect(pending[0].description).toContain('latitude');
  });

  it('adds latitude and longitude columns', () => {
    const { db, helpers } = createV6DB();
    applyMigrations(helpers);

    // Verify columns exist
    const cols = db.prepare("PRAGMA table_info(places)").all();
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('latitude');
    expect(colNames).toContain('longitude');
  });

  it('updates schema version past 7', () => {
    const { helpers } = createV6DB();
    applyMigrations(helpers);
    const row = helpers.get("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(parseInt(row.value, 10)).toBeGreaterThanOrEqual(7);
  });

  it('preserves existing place data', () => {
    const { db, helpers } = createV6DB();

    // Insert a place at v6
    db.prepare("INSERT INTO places (id, name, type, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run('PL1', 'Dublin', 'city', '', Date.now(), Date.now());

    applyMigrations(helpers);

    const place = helpers.get("SELECT * FROM places WHERE id = 'PL1'");
    expect(place.name).toBe('Dublin');
    expect(place.type).toBe('city');
    expect(place.latitude).toBeNull();
    expect(place.longitude).toBeNull();
  });

  it('is idempotent — running twice does not fail', () => {
    const { helpers } = createV6DB();
    applyMigrations(helpers);
    // Running again should be a no-op (all migrations already applied)
    expect(() => applyMigrations(helpers)).not.toThrow();
  });

  it('no pending migrations after full migration from v6', () => {
    const { helpers } = createV6DB();
    applyMigrations(helpers);
    const { pending } = getPendingMigrations(helpers);
    expect(pending).toHaveLength(0);
  });
});
