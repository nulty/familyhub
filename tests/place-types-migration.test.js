import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { PLACE_TYPE_SEEDS } from '../src/util/place-type-seeds.js';

/**
 * Simulate a pre-v8 database by loading schema.sql then reverting v8 changes:
 * drop place_types, recreate places with the old CHECK constraint.
 */
function setupPreV8DB() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  const schema = readFileSync('public/schema.sql', 'utf-8');
  db.exec(schema);

  // Revert to pre-v8 state: drop place_types, recreate places with CHECK
  db.exec('DROP TABLE IF EXISTS place_types');
  db.exec('PRAGMA foreign_keys=OFF');
  // Save existing places data
  db.exec('CREATE TABLE places_backup AS SELECT * FROM places');
  db.exec('DROP TABLE places');
  db.exec(`CREATE TABLE places (
    id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','country','province','county','barony','civil_parish','church_parish','parish','townland','city','town','suburb','village','street','address','cemetery')),
    parent_id TEXT REFERENCES places(id) ON DELETE SET NULL,
    latitude REAL, longitude REAL, notes TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  db.exec('INSERT INTO places SELECT * FROM places_backup');
  db.exec('DROP TABLE places_backup');
  db.exec('PRAGMA foreign_keys=ON');

  // Set schema_version to 7
  db.exec("UPDATE meta SET value = '7' WHERE key = 'schema_version'");

  return db;
}

function createHelpers(db) {
  return {
    all: (sql, params = []) => db.prepare(sql).all(...params),
    get: (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    run: (sql, params = []) => db.prepare(sql).run(...params).changes,
  };
}

describe('migration v8 — place_types table and CHECK removal', () => {
  it('creates place_types table with seed data', async () => {
    const db = setupPreV8DB();
    const helpers = createHelpers(db);
    const { applyMigrations } = await import('../src/db/migrations.js');
    applyMigrations(helpers);

    const types = helpers.all('SELECT * FROM place_types ORDER BY key');
    expect(types.length).toBe(PLACE_TYPE_SEEDS.length);
    expect(types.find(t => t.key === 'country')).toEqual({
      key: 'country', label: 'Country', source: 'nominatim',
    });
    expect(types.find(t => t.key === 'hamlet')).toEqual({
      key: 'hamlet', label: 'Hamlet', source: 'nominatim',
    });
    expect(types.every(t => t.source === 'nominatim')).toBe(true);
  });

  it('removes CHECK constraint from places.type', async () => {
    const db = setupPreV8DB();
    const helpers = createHelpers(db);
    const { applyMigrations } = await import('../src/db/migrations.js');
    applyMigrations(helpers);

    // Should be able to insert a place with a type not in the old CHECK list
    const now = Date.now();
    expect(() => {
      helpers.run(
        `INSERT INTO places (id, name, type, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ['test1', 'Test', 'hamlet', now, now]
      );
    }).not.toThrow();
  });

  it('preserves existing place data after migration', async () => {
    const db = setupPreV8DB();
    const helpers = createHelpers(db);

    // Insert a place before migration
    const now = Date.now();
    helpers.run(
      `INSERT INTO places (id, name, type, latitude, longitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['p1', 'Dublin', 'city', 53.35, -6.26, now, now]
    );

    const { applyMigrations } = await import('../src/db/migrations.js');
    applyMigrations(helpers);

    const place = helpers.get('SELECT * FROM places WHERE id = ?', ['p1']);
    expect(place.name).toBe('Dublin');
    expect(place.type).toBe('city');
    expect(place.latitude).toBe(53.35);
  });

  it('is idempotent — running twice does not fail or duplicate', async () => {
    const db = setupPreV8DB();
    const helpers = createHelpers(db);
    const { applyMigrations } = await import('../src/db/migrations.js');
    applyMigrations(helpers);

    // Reset version and run again
    helpers.run("UPDATE meta SET value = '7' WHERE key = 'schema_version'");
    expect(() => applyMigrations(helpers)).not.toThrow();

    const types = helpers.all('SELECT * FROM place_types');
    expect(types.length).toBe(PLACE_TYPE_SEEDS.length);
  });

  it('updates schema_version to 8', async () => {
    const db = setupPreV8DB();
    const helpers = createHelpers(db);
    const { applyMigrations } = await import('../src/db/migrations.js');
    applyMigrations(helpers);

    const row = helpers.get("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(row.value).toBe('8');
  });
});
