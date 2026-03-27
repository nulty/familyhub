import { describe, it, expect } from 'vitest';
import { setupV4TestDB, applyMigrationV5, applyMigrationV6 } from './db-helpers.js';
import { createHandlers } from '../src/db/handlers.js';

function insertPerson(helpers, id, name = 'Test') {
  const now = Date.now();
  helpers.run(
    'INSERT INTO people (id, given_name, surname, gender, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, name, '', 'U', '', now, now]
  );
}

function insertEvent(helpers, id, person_id, type = 'other', date = '') {
  const now = Date.now();
  helpers.run(
    'INSERT INTO events (id, person_id, type, date, place, notes, sort_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, person_id, type, date, '', '', null, now, now]
  );
}

function insertParticipant(helpers, id, event_id, person_id, role = 'witness') {
  const now = Date.now();
  helpers.run(
    'INSERT INTO event_participants (id, event_id, person_id, role, created_at) VALUES (?, ?, ?, ?, ?)',
    [id, event_id, person_id, role, now]
  );
}

describe('Migration v5', () => {
  it('makes events.person_id nullable', () => {
    const { helpers } = setupV4TestDB();
    applyMigrationV5(helpers);

    const cols = helpers.all("PRAGMA table_info(events)");
    const personIdCol = cols.find(c => c.name === 'person_id');
    expect(personIdCol.notnull).toBe(0); // nullable
  });

  it('converts marriage events to shared events with participants', () => {
    const { helpers } = setupV4TestDB();
    insertPerson(helpers, 'P1', 'John');
    insertPerson(helpers, 'P2', 'Mary');
    insertEvent(helpers, 'E1', 'P1', 'marriage', '1920');
    // P2 already a spouse participant (from earlier import fix)
    insertParticipant(helpers, 'EP1', 'E1', 'P2', 'spouse');

    applyMigrationV5(helpers);

    const ev = helpers.get('SELECT * FROM events WHERE id = ?', ['E1']);
    expect(ev.person_id).toBeNull();

    // Both spouses should be participants
    const participants = helpers.all('SELECT * FROM event_participants WHERE event_id = ?', ['E1']);
    expect(participants).toHaveLength(2);
    const roles = participants.map(p => p.role);
    expect(roles).toEqual(['spouse', 'spouse']);
  });

  it('converts marriage with no existing participant', () => {
    const { helpers } = setupV4TestDB();
    insertPerson(helpers, 'P1', 'John');
    insertEvent(helpers, 'E1', 'P1', 'marriage', '1920');

    applyMigrationV5(helpers);

    const ev = helpers.get('SELECT * FROM events WHERE id = ?', ['E1']);
    expect(ev.person_id).toBeNull();

    // Owner should be added as participant
    const participants = helpers.all('SELECT * FROM event_participants WHERE event_id = ?', ['E1']);
    expect(participants).toHaveLength(1);
    expect(participants[0].person_id).toBe('P1');
    expect(participants[0].role).toBe('spouse');
  });

  it('does not convert non-marriage events', () => {
    const { helpers } = setupV4TestDB();
    insertPerson(helpers, 'P1', 'John');
    insertEvent(helpers, 'E1', 'P1', 'birth', '1900');

    applyMigrationV5(helpers);

    const ev = helpers.get('SELECT * FROM events WHERE id = ?', ['E1']);
    expect(ev.person_id).toBe('P1'); // still owned
  });

  it('is idempotent', () => {
    const { helpers } = setupV4TestDB();
    insertPerson(helpers, 'P1', 'John');
    insertEvent(helpers, 'E1', 'P1', 'marriage', '1920');

    applyMigrationV5(helpers);
    applyMigrationV5(helpers);

    const participants = helpers.all('SELECT * FROM event_participants WHERE event_id = ?', ['E1']);
    expect(participants).toHaveLength(1); // no duplicates
  });

  it('handlers work with shared events after migration', () => {
    const { helpers } = setupV4TestDB();
    insertPerson(helpers, 'P1', 'John');
    insertPerson(helpers, 'P2', 'Mary');
    insertEvent(helpers, 'E1', 'P1', 'marriage', '1920');
    insertParticipant(helpers, 'EP1', 'E1', 'P2', 'spouse');

    applyMigrationV5(helpers);
    applyMigrationV6(helpers);
    const h = createHandlers(helpers);

    // Both people should see the shared event
    const r1 = h.getPersonWithEvents('P1');
    expect(r1.sharedEvents).toHaveLength(1);
    expect(r1.sharedEvents[0].type).toBe('marriage');

    const r2 = h.getPersonWithEvents('P2');
    expect(r2.sharedEvents).toHaveLength(1);
    expect(r2.sharedEvents[0].type).toBe('marriage');
  });
});
