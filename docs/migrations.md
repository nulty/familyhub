# Schema Migrations

Forward-only migrations for evolving the SQLite schema over time.

## How it works

1. `public/schema.sql` defines the complete current schema and sets `schema_version` in the `meta` table.
2. `src/db/migrations.js` exports a `migrations` array of versioned upgrade functions.
3. On boot, `worker.js` loads `schema.sql` (creates tables if they don't exist), then checks `schema_version` against pending migrations.
4. If migrations are pending, the worker reports them to the main thread. `App.svelte` shows a prompt letting the user back up before proceeding.
5. When the user confirms, the main thread sends a `runMigrations` message and each pending migration runs in version order.

## Adding a new migration

The current schema version is **7**. New migrations start at **8**.

### 1. Update `schema.sql`

Edit `public/schema.sql` to reflect the final state — add columns, tables, indexes, etc. Bump the version number in the `INSERT OR IGNORE INTO meta` line.

### 2. Add the migration

Add an entry to the `migrations` array in `src/db/migrations.js`:

```js
{
  version: 8,
  description: 'Short description of what this does',
  up(helpers) {
    const { run, all, get } = helpers;
    // migration logic here
  },
},
```

The `helpers` object provides:
- `run(sql, params)` — execute a statement, returns change count
- `all(sql, params)` — returns array of row objects
- `get(sql, params)` — returns first row or null
- `transaction(fn)` — wraps `fn` in BEGIN/COMMIT/ROLLBACK

### 3. Write tests

Add a test file `tests/migration-v8.test.js` that:
- Creates a DB at the previous schema version
- Runs the migration
- Verifies the schema and data are correct
- Tests idempotency (running twice doesn't fail)

## Rules

- **Migrations must be idempotent.** Inspect actual table state (`PRAGMA table_info`, `sqlite_master` queries) rather than assuming a starting point. This allows recovery from partial failures.
- **Migrations run independently**, not wrapped in a single transaction. SQLite DDL like `ALTER TABLE RENAME` is not truly transactional — a wrapping transaction gives false safety.
- **Both paths must produce the same schema.** A fresh install (via `schema.sql`) and an upgraded install (via migrations) must end up identical. This is the most important invariant.
- **SQLite FK pitfall:** With `PRAGMA foreign_keys=ON`, you cannot `ALTER TABLE RENAME` a table that is referenced as a parent by foreign keys. Disable FKs first (`PRAGMA foreign_keys=OFF`) and re-enable after.

## nukeDatabase

`nukeDatabase` in `worker.js` drops all tables and re-runs `schema.sql`. Since the schema is always the complete current version, no migrations need to run after a nuke.
