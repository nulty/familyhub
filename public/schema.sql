-- Family Tree Schema v7
-- All IDs are ULIDs (text, sortable, unique)

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

INSERT OR IGNORE INTO meta VALUES ('schema_version', '7');
INSERT OR IGNORE INTO meta VALUES ('created_at', CAST(unixepoch('now','subsec') * 1000 AS INTEGER));

CREATE TABLE IF NOT EXISTS people (
  id         TEXT PRIMARY KEY,
  given_name TEXT NOT NULL DEFAULT '',
  surname    TEXT NOT NULL DEFAULT '',
  gender     TEXT NOT NULL DEFAULT 'U' CHECK(gender IN ('M','F','U')),
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_people_surname ON people(surname);
CREATE INDEX IF NOT EXISTS idx_people_updated ON people(updated_at);

CREATE TABLE IF NOT EXISTS relationships (
  id           TEXT PRIMARY KEY,
  person_a_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  person_b_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK(type IN ('partner','parent_child')),
  -- for parent_child: person_a = parent, person_b = child
  -- for partner: order doesn't matter
  created_at   INTEGER NOT NULL,
  UNIQUE(person_a_id, person_b_id, type)
);

CREATE INDEX IF NOT EXISTS idx_rel_a ON relationships(person_a_id);
CREATE INDEX IF NOT EXISTS idx_rel_b ON relationships(person_b_id);

CREATE TABLE IF NOT EXISTS events (
  id         TEXT PRIMARY KEY,
  person_id  TEXT REFERENCES people(id) ON DELETE CASCADE,
  type       TEXT NOT NULL DEFAULT 'other',
  -- birth|death|residence|marriage|census|immigration|emigration|burial|other
  date       TEXT NOT NULL DEFAULT '',   -- free text: "1901", "3 SEP 1913"
  place      TEXT NOT NULL DEFAULT '',
  place_id   TEXT REFERENCES places(id) ON DELETE SET NULL,
  notes      TEXT NOT NULL DEFAULT '',
  sort_date  INTEGER,                    -- unix ms, nullable, computed on insert/update
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_person ON events(person_id, sort_date);
CREATE INDEX IF NOT EXISTS idx_events_type   ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_place  ON events(place);
CREATE INDEX IF NOT EXISTS idx_events_sort_date ON events(sort_date) WHERE sort_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS event_participants (
  id         TEXT PRIMARY KEY,
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'witness',
  -- father|mother|witness|godfather|godmother|informant|other
  created_at INTEGER NOT NULL,
  UNIQUE(event_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_ep_event  ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_ep_person ON event_participants(person_id);

CREATE TABLE IF NOT EXISTS repositories (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT ''
    CHECK(type IN ('','archive','library','website','database','church','government','personal','other')),
  url         TEXT NOT NULL DEFAULT '',   -- base URL for online repositories
  address     TEXT NOT NULL DEFAULT '',   -- physical address for brick-and-mortar repositories
  notes       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_repositories_name ON repositories(name);

CREATE TABLE IF NOT EXISTS sources (
  id            TEXT PRIMARY KEY,
  repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT ''
    CHECK(type IN ('','document','register','census','webpage','book','newspaper','certificate','photograph','other')),
  url           TEXT NOT NULL DEFAULT '',   -- source-level URL (e.g. a specific collection page)
  author        TEXT NOT NULL DEFAULT '',
  publisher     TEXT NOT NULL DEFAULT '',
  year          TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sources_repo  ON sources(repository_id);
CREATE INDEX IF NOT EXISTS idx_sources_title ON sources(title);

CREATE TABLE IF NOT EXISTS citations (
  id          TEXT PRIMARY KEY,
  source_id   TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  detail      TEXT NOT NULL DEFAULT '',   -- page number, entry number, film number
  url         TEXT NOT NULL DEFAULT '',   -- direct URL to this specific record/image
  accessed    TEXT NOT NULL DEFAULT '',   -- date accessed (for online sources)
  confidence  TEXT NOT NULL DEFAULT ''
    CHECK(confidence IN ('','primary','secondary','questionable')),
  notes       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_citations_source ON citations(source_id);

CREATE TABLE IF NOT EXISTS citation_events (
  citation_id TEXT NOT NULL REFERENCES citations(id) ON DELETE CASCADE,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  PRIMARY KEY (citation_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_ce_citation ON citation_events(citation_id);
CREATE INDEX IF NOT EXISTS idx_ce_event    ON citation_events(event_id);

CREATE TABLE IF NOT EXISTS places (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  type       TEXT NOT NULL DEFAULT '',
  parent_id  TEXT REFERENCES places(id) ON DELETE SET NULL,
  latitude   REAL,
  longitude  REAL,
  notes      TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_places_parent ON places(parent_id);
CREATE INDEX IF NOT EXISTS idx_places_name   ON places(name);
CREATE INDEX IF NOT EXISTS idx_places_type   ON places(type);

CREATE TABLE IF NOT EXISTS place_types (
  key    TEXT PRIMARY KEY,
  label  TEXT NOT NULL,
  source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS person_names (
  id          TEXT PRIMARY KEY,
  person_id   TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  given_name  TEXT NOT NULL DEFAULT '',
  surname     TEXT NOT NULL DEFAULT '',
  type        TEXT NOT NULL DEFAULT ''
    CHECK(type IN ('','birth','married','nickname','legal','aka')),
  date        TEXT NOT NULL DEFAULT '',   -- when name was adopted (e.g. marriage date)
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_names_person ON person_names(person_id);
