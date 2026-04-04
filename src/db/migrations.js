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
