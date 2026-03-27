/**
 * migrations.js — Forward-only schema migrations.
 *
 * Each migration is idempotent — it inspects actual table state rather than
 * assuming a clean starting point, so it can recover from partial failures.
 *
 * Migrations run independently (not wrapped in one transaction) because
 * SQLite DDL like ALTER TABLE RENAME is not transactional.
 */

import { ulid } from '../util/ulid.js';

export const migrations = [
  {
    version: 2,
    description: 'Add places table and events.place_id',
    up(helpers) {
      const { run, all } = helpers;
      run(`CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','country','province','county','barony','civil_parish','church_parish','parish','townland','city','town','suburb','village','street','address','cemetery')),
        parent_id TEXT REFERENCES places(id) ON DELETE SET NULL,
        notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      )`);
      run('CREATE INDEX IF NOT EXISTS idx_places_parent ON places(parent_id)');
      run('CREATE INDEX IF NOT EXISTS idx_places_name ON places(name)');
      run('CREATE INDEX IF NOT EXISTS idx_places_type ON places(type)');

      const evCols = all("PRAGMA table_info(events)");
      if (!evCols.some(c => c.name === 'place_id')) {
        run('ALTER TABLE events ADD COLUMN place_id TEXT REFERENCES places(id) ON DELETE SET NULL');
      }

      const now = Date.now();
      const distinct = all("SELECT DISTINCT place FROM events WHERE place != ''");
      for (const { place } of distinct) {
        const placeId = ulid();
        run('INSERT INTO places (id, name, type, parent_id, notes, created_at, updated_at) VALUES (?, ?, \'\', NULL, \'\', ?, ?)', [placeId, place, now, now]);
        run('UPDATE events SET place_id = ? WHERE place = ?', [placeId, place]);
      }
    },
  },
  {
    version: 3,
    description: 'Add repositories, citations; restructure sources',
    up(helpers) {
      const { run, all, get } = helpers;
      const now = Date.now();

      const sourceCols = all("PRAGMA table_info(sources)");
      const hasOldSchema = sourceCols.some(c => c.name === 'event_id');
      const hasNewSchema = sourceCols.some(c => c.name === 'repository_id');

      const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables.map(t => t.name);
      const hasSourcesOld = tableNames.includes('sources_old');

      let oldSources = [];
      if (hasOldSchema) {
        oldSources = all('SELECT * FROM sources');
      } else if (hasSourcesOld) {
        oldSources = all('SELECT * FROM sources_old');
      }

      if (hasOldSchema && !hasSourcesOld) {
        run('ALTER TABLE sources RENAME TO sources_old');
        run('DROP INDEX IF EXISTS idx_sources_event');
      } else if (hasOldSchema && hasSourcesOld) {
        run('DROP TABLE IF EXISTS sources');
        run('DROP INDEX IF EXISTS idx_sources_event');
      }

      run(`CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT '' CHECK(type IN ('','archive','library','website','database','church','government','personal','other')),
        url TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
      run('CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(name)');

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

      // Create citations table if it doesn't exist yet (fresh v2→v3 upgrade).
      // On newer schemas (v4+), citations already exists without event_id — that's fine,
      // the IF NOT EXISTS skips it and v4 migration handles the junction table.
      const citTables = all("SELECT name FROM sqlite_master WHERE type='table' AND name='citations'");
      if (citTables.length === 0) {
        run(`CREATE TABLE citations (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          detail TEXT NOT NULL DEFAULT '', url TEXT NOT NULL DEFAULT '',
          accessed TEXT NOT NULL DEFAULT '',
          confidence TEXT NOT NULL DEFAULT '' CHECK(confidence IN ('','primary','secondary','questionable')),
          notes TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
        run('CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_id)');
        run('CREATE INDEX IF NOT EXISTS idx_citations_event ON citations(event_id)');
      }

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
                repoMap[domain] = ulid();
                run('INSERT INTO repositories (id, name, type, url, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                  [repoMap[domain], domain, 'website', u.origin, '', '', now, now]);
              }
              repoId = repoMap[domain];
            } catch (e) { /* invalid URL, skip repo */ }
          }

          const sourceKey = `${repoId || ''}|${old.title || ''}`;
          if (!sourceMap[sourceKey] && (old.title || old.url)) {
            sourceMap[sourceKey] = ulid();
            const sourceType = old.url ? 'webpage' : '';
            run('INSERT INTO sources (id, repository_id, title, type, url, author, publisher, year, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [sourceMap[sourceKey], repoId, old.title || '', sourceType, old.url || '', '', '', '', old.notes || '', now, now]);
          }

          const newSourceId = sourceMap[sourceKey];
          if (newSourceId) {
            const citationId = ulid();
            run('INSERT INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [citationId, newSourceId, old.event_id, '', old.url || '', old.accessed || '', '', '', now, now]);
          }
        }
      }

      run('DROP TABLE IF EXISTS sources_old');
    },
  },
  {
    version: 4,
    description: 'Move citations.event_id to citation_events junction table',
    up(helpers) {
      const { run, all } = helpers;

      const tables = all("SELECT name FROM sqlite_master WHERE type='table'");
      const hasJunction = tables.some(t => t.name === 'citation_events');
      const citCols = all("PRAGMA table_info(citations)");
      const hasEventId = citCols.some(c => c.name === 'event_id');

      if (hasEventId) {
        // Table swap: recreate citations without event_id, move links to junction table.
        // Must create junction table AFTER the swap (not before) because renaming
        // the parent table would break FK references in citation_events.
        run('PRAGMA foreign_keys=OFF');

        // Drop existing junction table if partial previous run left one
        run('DROP TABLE IF EXISTS citation_events');

        run('ALTER TABLE citations RENAME TO citations_old');
        run(`CREATE TABLE citations (
          id TEXT PRIMARY KEY,
          source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
          detail TEXT NOT NULL DEFAULT '',
          url TEXT NOT NULL DEFAULT '',
          accessed TEXT NOT NULL DEFAULT '',
          confidence TEXT NOT NULL DEFAULT '' CHECK(confidence IN ('','primary','secondary','questionable')),
          notes TEXT NOT NULL DEFAULT '',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_id)');
        run(`INSERT INTO citations (id, source_id, detail, url, accessed, confidence, notes, created_at, updated_at)
             SELECT id, source_id, detail, url, accessed, confidence, notes, created_at, updated_at
             FROM citations_old`);

        // Now create junction table referencing the new citations table
        run(`CREATE TABLE citation_events (
          citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
          event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          PRIMARY KEY (citation_id, event_id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_ce_citation ON citation_events(citation_id)');
        run('CREATE INDEX IF NOT EXISTS idx_ce_event ON citation_events(event_id)');

        // Copy event links from old table
        run(`INSERT OR IGNORE INTO citation_events (citation_id, event_id)
             SELECT id, event_id FROM citations_old WHERE event_id IS NOT NULL`);

        run('DROP TABLE citations_old');
        run('PRAGMA foreign_keys=ON');
      } else if (!hasJunction) {
        // Fresh schema (v4 schema.sql) or partial run — just create junction table
        run(`CREATE TABLE IF NOT EXISTS citation_events (
          citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
          event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          PRIMARY KEY (citation_id, event_id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_ce_citation ON citation_events(citation_id)');
        run('CREATE INDEX IF NOT EXISTS idx_ce_event ON citation_events(event_id)');
      }
    },
  },
  {
    version: 5,
    description: 'Make events.person_id nullable and convert marriages to shared events',
    up(helpers) {
      const { run, all, get } = helpers;

      // Check if person_id is already nullable
      const evCols = all("PRAGMA table_info(events)");
      const personIdCol = evCols.find(c => c.name === 'person_id');
      if (!personIdCol) return; // no person_id column?
      const isNotNull = personIdCol.notnull === 1;

      if (isNotNull) {
        // Table swap to make person_id nullable.
        // Must also recreate tables that reference events (event_participants,
        // citation_events) because SQLite renames FK targets during ALTER RENAME.
        run('PRAGMA foreign_keys=OFF');

        // Save dependent data
        const epData = all('SELECT * FROM event_participants');
        const ceData = all('SELECT * FROM citation_events');

        run('DROP TABLE event_participants');
        run('DROP TABLE citation_events');
        run('ALTER TABLE events RENAME TO events_old');

        run(`CREATE TABLE events (
          id TEXT PRIMARY KEY,
          person_id TEXT REFERENCES people(id) ON DELETE CASCADE,
          type TEXT NOT NULL DEFAULT 'other',
          date TEXT NOT NULL DEFAULT '',
          place TEXT NOT NULL DEFAULT '',
          place_id TEXT REFERENCES places(id) ON DELETE SET NULL,
          notes TEXT NOT NULL DEFAULT '',
          sort_date INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, sort_date)');
        run('CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)');
        run('CREATE INDEX IF NOT EXISTS idx_events_place ON events(place)');
        run('CREATE INDEX IF NOT EXISTS idx_events_sort_date ON events(sort_date) WHERE sort_date IS NOT NULL');

        run(`INSERT INTO events SELECT * FROM events_old`);
        run('DROP TABLE events_old');

        // Recreate dependent tables with correct FK references
        run(`CREATE TABLE event_participants (
          id TEXT PRIMARY KEY,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
          role TEXT NOT NULL DEFAULT 'witness',
          created_at INTEGER NOT NULL,
          UNIQUE(event_id, person_id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_ep_event ON event_participants(event_id)');
        run('CREATE INDEX IF NOT EXISTS idx_ep_person ON event_participants(person_id)');
        for (const ep of epData) {
          run('INSERT INTO event_participants (id, event_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
            [ep.id, ep.event_id, ep.person_id, ep.role, ep.created_at]);
        }

        run(`CREATE TABLE citation_events (
          citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
          event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
          PRIMARY KEY (citation_id, event_id)
        )`);
        run('CREATE INDEX IF NOT EXISTS idx_ce_citation ON citation_events(citation_id)');
        run('CREATE INDEX IF NOT EXISTS idx_ce_event ON citation_events(event_id)');
        for (const ce of ceData) {
          run('INSERT INTO citation_events (citation_id, event_id) VALUES (?, ?)',
            [ce.citation_id, ce.event_id]);
        }

        run('PRAGMA foreign_keys=ON');
      }

      // Convert existing marriage events to shared events
      const marriages = all("SELECT * FROM events WHERE type = 'marriage' AND person_id IS NOT NULL");
      const now = Date.now();

      for (const m of marriages) {
        // Add the owner as a spouse participant if not already
        const existing = get(
          "SELECT id FROM event_participants WHERE event_id = ? AND person_id = ?",
          [m.id, m.person_id]
        );
        if (!existing) {
          run(
            "INSERT INTO event_participants (id, event_id, person_id, role, created_at) VALUES (?, ?, ?, 'spouse', ?)",
            [ulid(), m.id, m.person_id, now]
          );
        }

        // Null out person_id — event is now shared
        run("UPDATE events SET person_id = NULL WHERE id = ?", [m.id]);
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
