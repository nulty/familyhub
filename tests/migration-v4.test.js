import { describe, it, expect } from 'vitest';
import { setupV3TestDB, applyMigrationV4 } from './db-helpers.js';
import { createHandlers } from '../src/db/handlers.js';

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

function insertSource(helpers, id, title = 'Test Source') {
  const now = Date.now();
  helpers.run(
    'INSERT INTO sources (id, repository_id, title, type, url, author, publisher, year, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, null, title, '', '', '', '', '', '', now, now]
  );
}

function insertCitationV3(helpers, id, source_id, event_id) {
  const now = Date.now();
  helpers.run(
    'INSERT INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, source_id, event_id, '', '', '', '', '', now, now]
  );
}

describe('Migration v4', () => {
  it('creates citation_events table and removes event_id from citations', () => {
    const { helpers } = setupV3TestDB();
    applyMigrationV4(helpers);

    const tables = helpers.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
    const names = tables.map(t => t.name);
    expect(names).toContain('citation_events');

    const citCols = helpers.all("PRAGMA table_info(citations)");
    const colNames = citCols.map(c => c.name);
    expect(colNames).not.toContain('event_id');
    expect(colNames).toContain('source_id');
    expect(colNames).toContain('detail');
  });

  it('migrates existing citation event links to junction table', () => {
    const { helpers } = setupV3TestDB();
    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertEvent(helpers, 'E2', 'P1');
    insertSource(helpers, 'S1');
    insertCitationV3(helpers, 'C1', 'S1', 'E1');
    insertCitationV3(helpers, 'C2', 'S1', 'E2');

    applyMigrationV4(helpers);

    const junctionRows = helpers.all('SELECT * FROM citation_events ORDER BY citation_id');
    expect(junctionRows).toHaveLength(2);
    expect(junctionRows[0]).toEqual({ citation_id: 'C1', event_id: 'E1' });
    expect(junctionRows[1]).toEqual({ citation_id: 'C2', event_id: 'E2' });

    // Citation data is preserved
    const c1 = helpers.get('SELECT * FROM citations WHERE id = ?', ['C1']);
    expect(c1).not.toBeNull();
    expect(c1.source_id).toBe('S1');
  });

  it('is idempotent — running twice is safe', () => {
    const { helpers } = setupV3TestDB();
    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertSource(helpers, 'S1');
    insertCitationV3(helpers, 'C1', 'S1', 'E1');

    applyMigrationV4(helpers);
    // Run again — should not fail or duplicate data
    applyMigrationV4(helpers);

    const junctionRows = helpers.all('SELECT * FROM citation_events');
    expect(junctionRows).toHaveLength(1);
    const citations = helpers.all('SELECT * FROM citations');
    expect(citations).toHaveLength(1);
  });

  it('handlers work after migration', () => {
    const { helpers } = setupV3TestDB();
    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertSource(helpers, 'S1', 'Census 1901');
    insertCitationV3(helpers, 'C1', 'S1', 'E1');

    applyMigrationV4(helpers);

    const h = createHandlers(helpers);
    const list = h.listCitationsForEvent('E1');
    expect(list).toHaveLength(1);
    expect(list[0].source_title).toBe('Census 1901');

    // Can create new citations via handler
    h.createCitation({ id: 'C2', source_id: 'S1', event_id: 'E1', detail: 'p. 10' });
    expect(h.listCitationsForEvent('E1')).toHaveLength(2);
  });

  it('preserves citation data fields through migration', () => {
    const { helpers } = setupV3TestDB();
    insertPerson(helpers, 'P1');
    insertEvent(helpers, 'E1', 'P1');
    insertSource(helpers, 'S1');

    const now = Date.now();
    helpers.run(
      'INSERT INTO citations (id, source_id, event_id, detail, url, accessed, confidence, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['C1', 'S1', 'E1', 'p. 42', 'https://example.com', '2025-01-01', 'primary', 'Some notes', now, now]
    );

    applyMigrationV4(helpers);

    const c = helpers.get('SELECT * FROM citations WHERE id = ?', ['C1']);
    expect(c.detail).toBe('p. 42');
    expect(c.url).toBe('https://example.com');
    expect(c.accessed).toBe('2025-01-01');
    expect(c.confidence).toBe('primary');
    expect(c.notes).toBe('Some notes');
    expect(c.created_at).toBe(now);
  });
});
