/**
 * migrations.js — Forward-only schema migrations.
 *
 * Each migration is idempotent — it inspects actual table state rather than
 * assuming a clean starting point, so it can recover from partial failures.
 *
 * Migrations run independently (not wrapped in one transaction) because
 * SQLite DDL like ALTER TABLE RENAME is not transactional.
 */

export const migrations = [
  {
    version: 7,
    description: 'Add latitude and longitude to places',
    up({ get, run }) {
      const cols = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='places'");
      if (cols && !cols.sql.includes('latitude')) {
        run('ALTER TABLE places ADD COLUMN latitude REAL');
        run('ALTER TABLE places ADD COLUMN longitude REAL');
      }
    },
  },
  {
    version: 8,
    description: 'Add place_types table, remove CHECK constraint from places.type',
    up({ all, get, run }) {
      // 1. Create place_types if not exists
      const exists = get("SELECT name FROM sqlite_master WHERE type='table' AND name='place_types'");
      if (!exists) {
        run(`CREATE TABLE place_types (
          key    TEXT PRIMARY KEY,
          label  TEXT NOT NULL,
          source TEXT NOT NULL
        )`);
        const seeds = [
          ['country','Country','nominatim'],['region','Region','nominatim'],
          ['state','State','nominatim'],['state_district','State District','nominatim'],
          ['county','County','nominatim'],['municipality','Municipality','nominatim'],
          ['city','City','nominatim'],['city_district','City District','nominatim'],
          ['borough','Borough','nominatim'],['suburb','Suburb','nominatim'],
          ['quarter','Quarter','nominatim'],['neighbourhood','Neighbourhood','nominatim'],
          ['town','Town','nominatim'],['village','Village','nominatim'],
          ['hamlet','Hamlet','nominatim'],['isolated_dwelling','Isolated Dwelling','nominatim'],
          ['road','Road','nominatim'],['house_number','House Number','nominatim'],
          ['house_name','House Name','nominatim'],['farm','Farm','nominatim'],
        ];
        for (const [key, label, source] of seeds) {
          run('INSERT OR IGNORE INTO place_types (key, label, source) VALUES (?, ?, ?)', [key, label, source]);
        }
      }

      // 2. Remove CHECK constraint by recreating places table
      const tableSql = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='places'");
      if (tableSql && tableSql.sql.includes('CHECK')) {
        run('PRAGMA foreign_keys=OFF');
        run(`CREATE TABLE places_new (
          id         TEXT PRIMARY KEY,
          name       TEXT NOT NULL DEFAULT '',
          type       TEXT NOT NULL DEFAULT '',
          parent_id  TEXT REFERENCES places(id) ON DELETE SET NULL,
          latitude   REAL,
          longitude  REAL,
          notes      TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`);
        run('INSERT INTO places_new (id, name, type, parent_id, latitude, longitude, notes, created_at, updated_at) SELECT id, name, type, parent_id, latitude, longitude, notes, created_at, updated_at FROM places');
        run('DROP TABLE places');
        run('ALTER TABLE places_new RENAME TO places');
        run('CREATE INDEX IF NOT EXISTS idx_places_parent ON places(parent_id)');
        run('CREATE INDEX IF NOT EXISTS idx_places_name ON places(name)');
        run('CREATE INDEX IF NOT EXISTS idx_places_type ON places(type)');
        run('PRAGMA foreign_keys=ON');
      }
    },
  },
];

/**
 * Return pending migrations without applying them.
 * @param {Object} helpers — { all, get, run, transaction }
 * @returns {{ currentVersion: number, pending: Array<{ version: number, description: string }> }}
 */
export function getPendingMigrations(helpers) {
  const { get } = helpers;
  const currentRow = get("SELECT value FROM meta WHERE key = 'schema_version'");
  const currentVersion = currentRow ? parseInt(currentRow.value, 10) : 1;

  const pending = migrations
    .filter(m => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)
    .map(m => ({ version: m.version, description: m.description }));

  return { currentVersion, pending };
}

/**
 * Run pending migrations against the database.
 * @param {Object} helpers — { all, get, run, transaction }
 */
export function applyMigrations(helpers) {
  const { get, run } = helpers;
  const currentRow = get("SELECT value FROM meta WHERE key = 'schema_version'");
  const currentVersion = currentRow ? parseInt(currentRow.value, 10) : 1;

  const pending = migrations.filter(m => m.version > currentVersion);
  if (pending.length === 0) return;

  pending.sort((a, b) => a.version - b.version);

  for (const m of pending) {
    console.log(`[migrations] Running v${m.version}: ${m.description}`);
    try {
      m.up(helpers);
      run("UPDATE meta SET value = ? WHERE key = 'schema_version'", [String(m.version)]);
      console.log(`[migrations] v${m.version} complete`);
    } catch (e) {
      console.error(`[migrations] v${m.version} failed:`, e);
      throw e;
    }
  }
}
