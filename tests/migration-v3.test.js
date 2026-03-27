import { describe, it, expect } from 'vitest';
import { setupV2TestDB, applyMigrationV3, applyMigrationV4 } from './db-helpers.js';
import { createHandlers } from '../src/db/handlers.js';

function insertOldSource(helpers, { id, event_id, title = '', url = '', accessed = '', notes = '' }) {
  const now = Date.now();
  helpers.run(
    'INSERT INTO sources (id, event_id, title, url, accessed, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, event_id, title, url, accessed, notes, now, now]
  );
}

function insertPerson(helpers, id, name = 'Test') {
  const now = Date.now();
  helpers.run(
    'INSERT INTO people (id, given_name, surname, gender, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, '', 'U', '', now, now]
  );
}

function insertEvent(helpers, id, person_id) {
  const now = Date.now();
  helpers.run(
    'INSERT INTO events (id, person_id, type, date, place, notes, sort_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, person_id, 'other', '', '', '', null, now, now]
  );
}

describe('Migration v3', () => {
  it('creates repositories, sources, citations tables from v2 schema', () => {
    const { db, helpers } = setupV2TestDB();
    applyMigrationV3(helpers);

    const tables = helpers.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = tables.map(t => t.name);
    expect(names).toContain('repositories');
    expect(names).toContain('citations');
    expect(names).toContain('sources');
    expect(names).not.toContain('sources_old');
  });

  it('new sources table has repository_id and no event_id', () => {
    const { db, helpers } = setupV2TestDB();
    applyMigrationV3(helpers);

    const cols = helpers.all("PRAGMA table_info(sources)");
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('repository_id');
    expect(colNames).toContain('title');
    expect(colNames).toContain('type');
    expect(colNames).toContain('url');
    expect(colNames).toContain('author');
    expect(colNames).toContain('publisher');
    expect(colNames).toContain('year');
    expect(colNames).not.toContain('event_id');
  });

  it('migrates old source with URL into repository + source + citation', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, {
      id: 'S1', event_id: 'E1',
      title: 'Census 1901',
      url: 'https://www.census.nationalarchives.ie/pages/1901/123',
      accessed: '2024-01-15',
    });

    applyMigrationV3(helpers);

    const repos = helpers.all('SELECT * FROM repositories');
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('census.nationalarchives.ie');
    expect(repos[0].type).toBe('website');
    expect(repos[0].url).toBe('https://www.census.nationalarchives.ie');

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Census 1901');
    expect(sources[0].repository_id).toBe(repos[0].id);
    expect(sources[0].type).toBe('webpage');

    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(1);
    expect(citations[0].source_id).toBe(sources[0].id);
    expect(citations[0].event_id).toBe('E1');
    expect(citations[0].url).toBe('https://www.census.nationalarchives.ie/pages/1901/123');
    expect(citations[0].accessed).toBe('2024-01-15');
  });

  it('migrates old source without URL into source + citation (no repository)', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Parish Register' });

    applyMigrationV3(helpers);

    const repos = helpers.all('SELECT * FROM repositories');
    expect(repos).toHaveLength(0);

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Parish Register');
    expect(sources[0].repository_id).toBeNull();

    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(1);
    expect(citations[0].source_id).toBe(sources[0].id);
    expect(citations[0].event_id).toBe('E1');
  });

  it('de-duplicates sources with same domain into one repository', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertEvent(helpers, 'E2', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Record A', url: 'https://ancestry.com/page1' });
    insertOldSource(helpers, { id: 'S2', event_id: 'E2', title: 'Record B', url: 'https://ancestry.com/page2' });

    applyMigrationV3(helpers);

    const repos = helpers.all('SELECT * FROM repositories');
    expect(repos).toHaveLength(1);
    expect(repos[0].name).toBe('ancestry.com');

    // Two distinct titles → two sources
    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(2);
    expect(sources.every(s => s.repository_id === repos[0].id)).toBe(true);

    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(2);
  });

  it('de-duplicates sources with same repo + title into one source with multiple citations', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertEvent(helpers, 'E2', 'P1');
    // Same title, same domain → should become one source, two citations
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Census 1901', url: 'https://ancestry.com/census/1' });
    insertOldSource(helpers, { id: 'S2', event_id: 'E2', title: 'Census 1901', url: 'https://ancestry.com/census/2' });

    applyMigrationV3(helpers);

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Census 1901');

    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(2);
    expect(citations[0].source_id).toBe(citations[1].source_id);
    // Each citation preserves its own URL
    const urls = citations.map(c => c.url).sort();
    expect(urls).toEqual(['https://ancestry.com/census/1', 'https://ancestry.com/census/2']);
  });

  it('handles empty sources table gracefully', () => {
    const { db, helpers } = setupV2TestDB();
    applyMigrationV3(helpers);

    expect(helpers.all('SELECT * FROM repositories')).toHaveLength(0);
    expect(helpers.all('SELECT * FROM sources')).toHaveLength(0);
    expect(helpers.all('SELECT * FROM citations')).toHaveLength(0);
  });

  it('updates schema_version to 3', () => {
    const { db, helpers } = setupV2TestDB();
    applyMigrationV3(helpers);

    const version = helpers.get("SELECT value FROM meta WHERE key = 'schema_version'");
    expect(version.value).toBe('3');
  });

  it('handlers work after migration', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1', 'John');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Census', url: 'https://example.com/rec' });

    applyMigrationV3(helpers);
    applyMigrationV4(helpers);

    const handlers = createHandlers(helpers);

    // Verify CRUD works on new schema
    const repo = handlers.createRepository({ id: 'R1', name: 'Test Archive', type: 'archive' });
    expect(repo.name).toBe('Test Archive');

    const src = handlers.createSource({ id: 'NEW1', repository_id: 'R1', title: 'New Source' });
    expect(src.repository_id).toBe('R1');

    const citation = handlers.createCitation({ id: 'C1', source_id: 'NEW1', event_id: 'E1', detail: 'p. 5' });
    expect(citation.detail).toBe('p. 5');

    // Verify migrated data is accessible via junction table
    const result = handlers.getPersonWithEvents('P1');
    expect(result.events).toHaveLength(1);
    // Should have the migrated citation + the new one
    expect(result.events[0].citations).toHaveLength(2);
  });

  it('is idempotent — running twice does not duplicate data', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Census', url: 'https://example.com/rec' });

    applyMigrationV3(helpers);

    const sourcesAfterFirst = helpers.all('SELECT * FROM sources');
    const citationsAfterFirst = helpers.all('SELECT * FROM citations');
    const reposAfterFirst = helpers.all('SELECT * FROM repositories');

    // Reset version to trigger re-run
    helpers.run("UPDATE meta SET value = '2' WHERE key = 'schema_version'");
    applyMigrationV3(helpers);

    // Second run should not create duplicates — old data is gone (sources_old dropped),
    // new sources table already has repository_id, so hasOldSchema=false, no data migration
    const sourcesAfterSecond = helpers.all('SELECT * FROM sources');
    const citationsAfterSecond = helpers.all('SELECT * FROM citations');
    const reposAfterSecond = helpers.all('SELECT * FROM repositories');

    expect(sourcesAfterSecond.length).toBe(sourcesAfterFirst.length);
    expect(citationsAfterSecond.length).toBe(citationsAfterFirst.length);
    expect(reposAfterSecond.length).toBe(reposAfterFirst.length);
  });

  it('recovers from partial run where sources was renamed but new table not created', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Census', url: 'https://example.com/rec' });

    // Simulate partial migration: rename happened but nothing else
    helpers.run('ALTER TABLE sources RENAME TO sources_old');

    applyMigrationV3(helpers);

    // Should recover: read from sources_old, create new tables, migrate data
    const tables = helpers.all("SELECT name FROM sqlite_master WHERE type='table'").map(t => t.name);
    expect(tables).toContain('sources');
    expect(tables).toContain('repositories');
    expect(tables).toContain('citations');
    expect(tables).not.toContain('sources_old');

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Census');

    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(1);
  });

  it('handles source with invalid URL gracefully (no repository created)', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Some record', url: 'not-a-url' });

    applyMigrationV3(helpers);

    const repos = helpers.all('SELECT * FROM repositories');
    expect(repos).toHaveLength(0);

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources).toHaveLength(1);
    expect(sources[0].repository_id).toBeNull();
  });

  it('preserves notes from old sources', () => {
    const { db, helpers } = setupV2TestDB();

    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertOldSource(helpers, { id: 'S1', event_id: 'E1', title: 'Census', notes: 'Important note' });

    applyMigrationV3(helpers);

    const sources = helpers.all('SELECT * FROM sources');
    expect(sources[0].notes).toBe('Important note');
  });
});
