import { describe, it, expect, beforeEach } from 'vitest';
import { setupTestDB } from './db-helpers.js';

let h; // handlers
let db;

beforeEach(() => {
  const setup = setupTestDB();
  h = setup.handlers;
  db = setup.db;
});

// ─── People ───────────────────────────────────────────────────────────────────

describe('People', () => {
  it('createPerson inserts and returns record', async () => {
    const p = await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M' });
    expect(p.id).toBe('P1');
    expect(p.given_name).toBe('John');
    expect(p.surname).toBe('Smith');
    expect(p.gender).toBe('M');
    expect(p.created_at).toBeGreaterThan(0);
  });

  it('getPerson retrieves by ID', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    expect((await h.getPerson('P1')).given_name).toBe('John');
  });

  it('getPerson returns null for missing ID', async () => {
    expect(await h.getPerson('MISSING')).toBeNull();
  });

  it('updatePerson updates allowed fields', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    const updated = await h.updatePerson('P1', { surname: 'Jones' });
    expect(updated.surname).toBe('Jones');
    expect(updated.given_name).toBe('John'); // unchanged
  });

  it('updatePerson ignores disallowed fields', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    const before = await h.getPerson('P1');
    await h.updatePerson('P1', { id: 'HACKED', created_at: 0 });
    const after = await h.getPerson('P1');
    expect(after.id).toBe('P1');
    expect(after.created_at).toBe(before.created_at);
  });

  it('updatePerson updates updated_at', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    const before = await h.getPerson('P1');
    // Small delay to ensure different timestamp
    const updated = await h.updatePerson('P1', { given_name: 'Jane' });
    expect(updated.updated_at).toBeGreaterThanOrEqual(before.updated_at);
  });

  it('deletePerson removes the record', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.deletePerson('P1');
    expect(await h.getPerson('P1')).toBeNull();
  });

  it('searchPeople finds by given_name', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    await h.createPerson({ id: 'P2', given_name: 'Mary', surname: 'Jones' });
    const results = await h.searchPeople('John');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('P1');
  });

  it('searchPeople finds by surname', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    const results = await h.searchPeople('Smith');
    expect(results).toHaveLength(1);
  });

  it('searchPeople with empty query returns all', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    const results = await h.searchPeople('');
    expect(results).toHaveLength(2);
  });
});

// ─── Relationships ────────────────────────────────────────────────────────────

describe('Relationships', () => {
  beforeEach(async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    await h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    await h.createPerson({ id: 'P3', given_name: 'Tom', gender: 'M' });
  });

  it('addPartner creates partner relationship', async () => {
    const rel = await h.addPartner('R1', 'P1', 'P2');
    expect(rel.type).toBe('partner');
    expect(rel.person_a_id).toBe('P1');
    expect(rel.person_b_id).toBe('P2');
  });

  it('addParentChild creates parent_child relationship', async () => {
    const rel = await h.addParentChild('R1', 'P1', 'P3');
    expect(rel.type).toBe('parent_child');
  });

  it('duplicate relationship is ignored (INSERT OR IGNORE)', async () => {
    await h.addPartner('R1', 'P1', 'P2');
    // Same people, same type — should not throw
    await h.addPartner('R2', 'P1', 'P2');
    const stats = await h.getStats();
    expect(stats.relationships).toBe(1);
  });

  it('removeRelationship deletes it', async () => {
    await h.addPartner('R1', 'P1', 'P2');
    await h.removeRelationship('R1');
    expect((await h.getStats()).relationships).toBe(0);
  });

  it('getFamily returns parents, children, partners', async () => {
    await h.addPartner('R1', 'P1', 'P2');
    await h.addParentChild('R2', 'P1', 'P3');
    await h.addParentChild('R3', 'P2', 'P3');

    const family = await h.getFamily('P3');
    expect(family.parents).toHaveLength(2);
    expect(family.children).toHaveLength(0);
    expect(family.partners).toHaveLength(0);

    const parentFamily = await h.getFamily('P1');
    expect(parentFamily.children).toHaveLength(1);
    expect(parentFamily.partners).toHaveLength(1);
  });

  it('getFamily returns birth_year, death_year, and other_parent_id for children', async () => {
    await h.addPartner('R1', 'P1', 'P2');
    await h.addParentChild('R2', 'P1', 'P3');
    await h.addParentChild('R3', 'P2', 'P3');
    await h.createEvent({ id: 'E1', person_id: 'P2', type: 'birth', date: '1895' });
    await h.createEvent({ id: 'E2', person_id: 'P2', type: 'death', date: '1960' });
    await h.createEvent({ id: 'E3', person_id: 'P3', type: 'birth', date: '1921' });

    const family = await h.getFamily('P1');
    expect(family.partners[0].birth_year).toBe('1895');
    expect(family.partners[0].death_year).toBe('1960');
    expect(family.children[0].birth_year).toBe('1921');
    expect(family.children[0].other_parent_id).toBe('P2');
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('Events', () => {
  beforeEach(async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
  });

  it('createEvent inserts and returns record', async () => {
    const ev = await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', sort_date: Date.UTC(1900, 0, 1) });
    expect(ev.type).toBe('birth');
    expect(ev.person_id).toBe('P1');
  });

  it('updateEvent updates allowed fields', async () => {
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', place: 'Dublin' });
    const updated = await h.updateEvent('E1', { place: 'Cork' });
    expect(updated.place).toBe('Cork');
  });

  it('deleteEvent removes the record', async () => {
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.deleteEvent('E1');
    expect(await h.listEvents('P1')).toHaveLength(0);
  });

  it('listEvents returns events ordered by sort_date', async () => {
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'death', sort_date: 200 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'birth', sort_date: 100 });
    const list = await h.listEvents('P1');
    expect(list[0].type).toBe('birth');
    expect(list[1].type).toBe('death');
  });

  it('null sort_date sorts last', async () => {
    await h.createEvent({ id: 'E1', person_id: 'P1', sort_date: null });
    await h.createEvent({ id: 'E2', person_id: 'P1', sort_date: 100 });
    const list = await h.listEvents('P1');
    expect(list[0].id).toBe('E2');
    expect(list[1].id).toBe('E1');
  });
});

// ─── Participants ─────────────────────────────────────────────────────────────

describe('Participants', () => {
  beforeEach(async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
  });

  it('addParticipant links person to event', async () => {
    const result = await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    expect(result.role).toBe('witness');
  });

  it('getParticipantsForEvent returns participant details', async () => {
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    const participants = await h.getParticipantsForEvent('E1');
    expect(participants).toHaveLength(1);
    expect(participants[0].given_name).toBe('Mary');
  });

  it('removeParticipant removes the link', async () => {
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2' });
    await h.removeParticipant('E1', 'P2');
    expect(await h.getParticipantsForEvent('E1')).toHaveLength(0);
  });

  it('updateParticipantRole changes the role', async () => {
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    const updated = await h.updateParticipantRole('E1', 'P2', 'informant');
    expect(updated.role).toBe('informant');
  });
});

// ─── Repositories ─────────────────────────────────────────────────────────────

describe('Repositories', () => {
  it('createRepository inserts and returns record', async () => {
    const repo = await h.createRepository({ id: 'R1', name: 'Ancestry.com', type: 'website', url: 'https://ancestry.com' });
    expect(repo.id).toBe('R1');
    expect(repo.name).toBe('Ancestry.com');
    expect(repo.type).toBe('website');
    expect(repo.url).toBe('https://ancestry.com');
  });

  it('getRepository retrieves by ID', async () => {
    await h.createRepository({ id: 'R1', name: 'National Archives' });
    expect((await h.getRepository('R1')).name).toBe('National Archives');
  });

  it('getRepository returns null for missing', async () => {
    expect(await h.getRepository('MISSING')).toBeNull();
  });

  it('updateRepository updates allowed fields', async () => {
    await h.createRepository({ id: 'R1', name: 'Old Name' });
    const updated = await h.updateRepository('R1', { name: 'New Name', type: 'archive' });
    expect(updated.name).toBe('New Name');
    expect(updated.type).toBe('archive');
  });

  it('deleteRepository removes it and nullifies source references', async () => {
    await h.createRepository({ id: 'R1', name: 'Ancestry' });
    await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    await h.deleteRepository('R1');
    expect(await h.getRepository('R1')).toBeNull();
    const src = await h.getSource('S1');
    expect(src.repository_id).toBeNull();
  });

  it('listRepositories returns all sorted by name', async () => {
    await h.createRepository({ id: 'R1', name: 'Zeta' });
    await h.createRepository({ id: 'R2', name: 'Alpha' });
    const list = await h.listRepositories();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Alpha');
  });

  it('searchRepositories finds by name or url', async () => {
    await h.createRepository({ id: 'R1', name: 'Ancestry', url: 'https://ancestry.com' });
    await h.createRepository({ id: 'R2', name: 'FamilySearch', url: 'https://familysearch.org' });
    expect(await h.searchRepositories('Anc')).toHaveLength(1);
    expect(await h.searchRepositories('familysearch')).toHaveLength(1);
    expect(await h.searchRepositories('')).toHaveLength(0);
  });
});

// ─── Sources ──────────────────────────────────────────────────────────────────

describe('Sources', () => {
  it('createSource inserts and returns record', async () => {
    const src = await h.createSource({ id: 'S1', title: 'Census 1901', type: 'census', url: 'https://example.com/census' });
    expect(src.id).toBe('S1');
    expect(src.title).toBe('Census 1901');
    expect(src.type).toBe('census');
  });

  it('createSource with repository_id links to repo', async () => {
    await h.createRepository({ id: 'R1', name: 'Ancestry' });
    const src = await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    expect(src.repository_id).toBe('R1');
  });

  it('getSource includes repository_name', async () => {
    await h.createRepository({ id: 'R1', name: 'Ancestry' });
    await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    const src = await h.getSource('S1');
    expect(src.repository_name).toBe('Ancestry');
  });

  it('getSource returns null repository_name when no repo', async () => {
    await h.createSource({ id: 'S1', title: 'My Notes' });
    const src = await h.getSource('S1');
    expect(src.repository_name).toBeNull();
  });

  it('updateSource updates allowed fields', async () => {
    await h.createSource({ id: 'S1', title: 'Old' });
    const updated = await h.updateSource('S1', { title: 'New', author: 'John' });
    expect(updated.title).toBe('New');
    expect(updated.author).toBe('John');
  });

  it('deleteSource removes it and cascades to citations', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.createSource({ id: 'S1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.deleteSource('S1');
    expect(await h.getCitation('C1')).toBeNull();
  });

  it('listSources returns all sources sorted by title', async () => {
    await h.createSource({ id: 'S1', title: 'Zebra' });
    await h.createSource({ id: 'S2', title: 'Alpha' });
    const list = await h.listSources();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Alpha');
  });

  it('searchSources finds by title', async () => {
    await h.createSource({ id: 'S1', title: 'Census 1901' });
    await h.createSource({ id: 'S2', title: 'Birth Cert' });
    expect(await h.searchSources('Census')).toHaveLength(1);
    expect(await h.searchSources('')).toHaveLength(0);
  });

  it('listSourcesForEvent returns sources cited in event', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.createSource({ id: 'S1', title: 'Census' });
    await h.createSource({ id: 'S2', title: 'Other' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    const sources = await h.listSourcesForEvent('E1');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Census');
  });
});

// ─── Citations ────────────────────────────────────────────────────────────────

describe('Citations', () => {
  beforeEach(async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.createRepository({ id: 'R1', name: 'Ancestry' });
    await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census 1901' });
  });

  it('createCitation inserts and returns record', async () => {
    const c = await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42', url: 'https://example.com/page', confidence: 'primary' });
    expect(c.id).toBe('C1');
    expect(c.source_id).toBe('S1');
    expect(c.detail).toBe('p. 42');
    expect(c.confidence).toBe('primary');
    // event_id is now in citation_events junction table
    const linked = await h.listCitationsForEvent('E1');
    expect(linked).toHaveLength(1);
    expect(linked[0].id).toBe('C1');
  });

  it('updateCitation updates allowed fields', async () => {
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'old' });
    const updated = await h.updateCitation('C1', { detail: 'new', confidence: 'secondary' });
    expect(updated.detail).toBe('new');
    expect(updated.confidence).toBe('secondary');
  });

  it('deleteCitation removes it', async () => {
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.deleteCitation('C1');
    expect(await h.getCitation('C1')).toBeNull();
  });

  it('listCitationsForEvent returns enriched rows', async () => {
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42' });
    const list = await h.listCitationsForEvent('E1');
    expect(list).toHaveLength(1);
    expect(list[0].source_title).toBe('Census 1901');
    expect(list[0].repository_name).toBe('Ancestry');
    expect(list[0].detail).toBe('p. 42');
  });

  it('listCitationsForSource returns citation details with event info', async () => {
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.createCitation({ id: 'C2', source_id: 'S1', event_id: 'E2' });
    const list = await h.listCitationsForSource('S1');
    expect(list).toHaveLength(2);
    expect(list[0].given_name).toBe('John');
  });

  it('deleting event removes junction rows but citation remains', async () => {
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.deleteEvent('E1');
    // Citation itself is preserved (many-to-many: may link to other events)
    expect(await h.getCitation('C1')).not.toBeNull();
    // But it's no longer linked to any event
    expect(await h.listCitationsForEvent('E1')).toHaveLength(0);
  });

  it('deleting person removes junction rows but citation remains', async () => {
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.deletePerson('P1');
    // Citation preserved, junction rows gone via cascade (event deleted → citation_events rows deleted)
    expect(await h.getCitation('C1')).not.toBeNull();
  });
});

// ─── Graph ────────────────────────────────────────────────────────────────────

describe('Graph', () => {
  it('getGraphData builds node array with rels', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    await h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    await h.createPerson({ id: 'P3', given_name: 'Tom', gender: 'M' });
    await h.addPartner('R1', 'P1', 'P2');
    await h.addParentChild('R2', 'P1', 'P3');
    await h.addParentChild('R3', 'P2', 'P3');

    const nodes = await h.getGraphData();
    expect(nodes).toHaveLength(3);

    const tom = nodes.find(n => n.id === 'P3');
    expect(tom.rels.father).toBe('P1');
    expect(tom.rels.mother).toBe('P2');

    const john = nodes.find(n => n.id === 'P1');
    expect(john.rels.spouses).toContain('P2');
    expect(john.rels.children).toContain('P3');
  });

  it('includes birth/death dates and places', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '3 SEP 1890', place: 'Dublin' });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '15 MAR 1945', place: 'Cork' });

    const nodes = await h.getGraphData();
    const john = nodes.find(n => n.id === 'P1');
    expect(john.data.birth_date).toBe('3 SEP 1890');
    expect(john.data.birth_place).toBe('Dublin');
    expect(john.data.death_date).toBe('15 MAR 1945');
    expect(john.data.death_place).toBe('Cork');
  });

  it('computes life_years from birth and death', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1890' });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '1945' });

    const nodes = await h.getGraphData();
    expect(nodes[0].data.life_years).toBe('1890 – 1945');
  });

  it('shows birth year with ? for death when still alive', async () => {
    await h.createPerson({ id: 'P1', given_name: 'Mary', gender: 'F' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1990' });

    const nodes = await h.getGraphData();
    expect(nodes[0].data.life_years).toBe('1990 – ');
    expect(nodes[0].data.death_date).toBe('');
  });

  it('returns empty strings when no events exist', async () => {
    await h.createPerson({ id: 'P1', given_name: 'Pat', gender: 'U' });

    const nodes = await h.getGraphData();
    expect(nodes[0].data.birth_date).toBe('');
    expect(nodes[0].data.death_date).toBe('');
    expect(nodes[0].data.birth_place).toBe('');
    expect(nodes[0].data.death_place).toBe('');
    expect(nodes[0].data.life_years).toBe('');
  });
});

// ─── Places ───────────────────────────────────────────────────────────────────

describe('Places', () => {
  it('createPlace inserts and returns a record', async () => {
    const pl = await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    expect(pl.id).toBe('PL1');
    expect(pl.name).toBe('Ireland');
    expect(pl.type).toBe('country');
    expect(pl.parent_id).toBeNull();
  });

  it('getPlace retrieves by ID', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland' });
    expect((await h.getPlace('PL1')).name).toBe('Ireland');
  });

  it('getPlace returns null for missing', async () => {
    expect(await h.getPlace('MISSING')).toBeNull();
  });

  it('updatePlace updates allowed fields', async () => {
    await h.createPlace({ id: 'PL1', name: 'Irland', type: '' });
    const updated = await h.updatePlace('PL1', { name: 'Ireland', type: 'country' });
    expect(updated.name).toBe('Ireland');
    expect(updated.type).toBe('country');
  });

  it('deletePlace removes the record', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland' });
    await h.deletePlace('PL1');
    expect(await h.getPlace('PL1')).toBeNull();
  });

  it('deletePlace sets children parent_id to null', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland' });
    await h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    await h.deletePlace('PL1');
    expect((await h.getPlace('PL2')).parent_id).toBeNull();
  });

  it('deletePlace sets events place_id to null', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin' });
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    await h.deletePlace('PL1');
    const ev = await h.listEvents('P1');
    expect(ev[0].place_id).toBeNull();
    expect(ev[0].place).toBe('Dublin'); // text preserved
  });

  it('listPlaces returns all sorted by name', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin' });
    await h.createPlace({ id: 'PL2', name: 'Cork' });
    const list = await h.listPlaces();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Cork');
    expect(list[1].name).toBe('Dublin');
  });

  it('searchPlaces finds by name', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    await h.createPlace({ id: 'PL2', name: 'Cork', type: 'city' });
    const results = await h.searchPlaces('Dub');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Dublin');
  });

  it('searchPlaces returns full_name computed from hierarchy', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    await h.createPlace({ id: 'PL2', name: 'Leinster', type: 'province', parent_id: 'PL1' });
    await h.createPlace({ id: 'PL3', name: 'Dublin', type: 'city', parent_id: 'PL2' });
    const results = await h.searchPlaces('Dublin');
    expect(results).toHaveLength(1);
    expect(results[0].full_name).toBe('Dublin, Leinster, Ireland');
  });

  it('searchPlaces full_name for root place is just the name', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    const results = await h.searchPlaces('Ireland');
    expect(results[0].full_name).toBe('Ireland');
  });

  it('searchPlaces with empty query returns empty array', async () => {
    expect(await h.searchPlaces('')).toEqual([]);
    expect(await h.searchPlaces(null)).toEqual([]);
  });

  it('getPlaceHierarchy returns ancestor chain', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    await h.createPlace({ id: 'PL2', name: 'Leinster', type: 'province', parent_id: 'PL1' });
    await h.createPlace({ id: 'PL3', name: 'Dublin', type: 'county', parent_id: 'PL2' });
    const chain = await h.getPlaceHierarchy('PL3');
    expect(chain).toHaveLength(3);
    expect(chain[0].name).toBe('Ireland');
    expect(chain[1].name).toBe('Leinster');
    expect(chain[2].name).toBe('Dublin');
  });

  it('getPlaceChildren returns immediate children', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland' });
    await h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    await h.createPlace({ id: 'PL3', name: 'Cork', parent_id: 'PL1' });
    const children = await h.getPlaceChildren('PL1');
    expect(children).toHaveLength(2);
  });

  it('getPlaceChildren with null returns root places', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland' });
    await h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    const roots = await h.getPlaceChildren(null);
    expect(roots).toHaveLength(1);
    expect(roots[0].name).toBe('Ireland');
  });

  it('createEvent with place_id links to place', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin' });
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    const ev = await h.listEvents('P1');
    expect(ev[0].place_id).toBe('PL1');
  });

  it('updateEvent can change place_id', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin' });
    await h.createPlace({ id: 'PL2', name: 'Cork' });
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    await h.updateEvent('E1', { place: 'Cork', place_id: 'PL2' });
    const ev = await h.listEvents('P1');
    expect(ev[0].place_id).toBe('PL2');
  });

  it('bulkImport with places inserts place records', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    const counts = await h.bulkImport({
      people: [], relationships: [], sources: [], citations: [], repositories: [], participants: [],
      places: [{ id: 'PL1', name: 'Dublin', type: 'city' }],
      events: [{ id: 'E1', person_id: 'P1', type: 'birth', place: 'Dublin', place_id: 'PL1' }],
    });
    expect(counts.places).toBe(1);
    expect((await h.getPlace('PL1')).name).toBe('Dublin');
    expect((await h.listEvents('P1'))[0].place_id).toBe('PL1');
  });

  it('getStats includes places count', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin' });
    expect((await h.getStats()).places).toBe(1);
  });

  it('createPlace stores latitude and longitude', async () => {
    const pl = await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city', latitude: 53.3498, longitude: -6.2603 });
    expect(pl.latitude).toBeCloseTo(53.3498, 4);
    expect(pl.longitude).toBeCloseTo(-6.2603, 4);
  });

  it('createPlace defaults latitude and longitude to null', async () => {
    const pl = await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    expect(pl.latitude).toBeNull();
    expect(pl.longitude).toBeNull();
  });

  it('updatePlace can set latitude and longitude', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    const updated = await h.updatePlace('PL1', { latitude: 53.35, longitude: -6.26 });
    expect(updated.latitude).toBeCloseTo(53.35, 2);
    expect(updated.longitude).toBeCloseTo(-6.26, 2);
  });

  it('updatePlace can clear latitude and longitude', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city', latitude: 53.35, longitude: -6.26 });
    const updated = await h.updatePlace('PL1', { latitude: null, longitude: null });
    expect(updated.latitude).toBeNull();
    expect(updated.longitude).toBeNull();
  });

  it('bulkImport preserves place latitude and longitude', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.bulkImport({
      people: [], relationships: [], sources: [], citations: [], repositories: [], participants: [],
      places: [{ id: 'PL1', name: 'Dublin', type: 'city', latitude: 53.35, longitude: -6.26 }],
      events: [],
    });
    const pl = await h.getPlace('PL1');
    expect(pl.latitude).toBeCloseTo(53.35, 2);
    expect(pl.longitude).toBeCloseTo(-6.26, 2);
  });

  it('getPlaceTree returns all places', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    await h.createPlace({ id: 'PL2', name: 'Dublin', type: 'city', parent_id: 'PL1' });
    const tree = await h.getPlaceTree();
    expect(tree).toHaveLength(2);
    expect(tree[0].name).toBe('Dublin'); // sorted by name
    expect(tree[1].name).toBe('Ireland');
  });

  it('findPlaceByNameTypeParent finds matching place', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    await h.createPlace({ id: 'PL2', name: 'Dublin', type: 'county', parent_id: 'PL1' });
    const found = await h.findPlaceByNameTypeParent('Dublin', 'county', 'PL1');
    expect(found).not.toBeNull();
    expect(found.id).toBe('PL2');
  });

  it('findPlaceByNameTypeParent finds root place', async () => {
    await h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    const found = await h.findPlaceByNameTypeParent('Ireland', 'country', null);
    expect(found).not.toBeNull();
    expect(found.id).toBe('PL1');
  });

  it('findPlaceByNameTypeParent returns null when not found', async () => {
    expect(await h.findPlaceByNameTypeParent('Atlantis', 'city', null)).toBeNull();
  });

  it('getPeopleByPlace finds people with events at a place', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    await h.createPerson({ id: 'P2', given_name: 'Mary', surname: 'Jones' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', place_id: 'PL1' });
    const people = await h.getPeopleByPlace('PL1');
    expect(people).toHaveLength(1);
    expect(people[0].given_name).toBe('John');
  });

  it('getPeopleByPlace finds participants too', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: null, type: 'marriage', place_id: 'PL1' });
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P1' });
    await h.addParticipant({ id: 'EP2', event_id: 'E1', person_id: 'P2' });
    const people = await h.getPeopleByPlace('PL1');
    expect(people).toHaveLength(2);
  });

  it('getEventsByPlace returns events at a place with person info', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', place_id: 'PL1', sort_date: -2208988800000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '1970', place_id: 'PL1', sort_date: 0 });
    const events = await h.getEventsByPlace('PL1');
    expect(events).toHaveLength(2);
    expect(events[0].given_name).toBe('John');
    expect(events[0].type).toBe('birth'); // sorted by sort_date
  });

  it('getEventsByPlace includes participants for shared events', async () => {
    await h.createPlace({ id: 'PL1', name: 'Dublin', type: 'city' });
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: null, type: 'marriage', place_id: 'PL1' });
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P1' });
    await h.addParticipant({ id: 'EP2', event_id: 'E1', person_id: 'P2' });
    const events = await h.getEventsByPlace('PL1');
    expect(events).toHaveLength(1);
    expect(events[0].participants).toHaveLength(2);
  });
});

// ─── Bulk ─────────────────────────────────────────────────────────────────────

describe('Bulk', () => {
  it('bulkImport inserts all entity types', async () => {
    const counts = await h.bulkImport({
      people: [{ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' }],
      relationships: [],
      events: [{ id: 'E1', person_id: 'P1', type: 'birth', date: '1900' }],
      repositories: [{ id: 'R1', name: 'Ancestry', type: 'website' }],
      sources: [{ id: 'S1', repository_id: 'R1', title: 'Census' }],
      citations: [{ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42' }],
      participants: [],
    });
    expect(counts.people).toBe(1);
    expect(counts.events).toBe(1);
    expect(counts.repositories).toBe(1);
    expect(counts.sources).toBe(1);
    expect(counts.citations).toBe(1);
  });

  it('exportAll returns all data including repositories and citations', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.createRepository({ id: 'R1', name: 'Ancestry' });
    await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    const data = await h.exportAll();
    expect(data.people).toHaveLength(1);
    expect(data.events).toHaveLength(1);
    expect(data.repositories).toHaveLength(1);
    expect(data.sources).toHaveLength(1);
    expect(data.citations).toHaveLength(1);
    expect(data.citation_events).toHaveLength(1);
    expect(data.citation_events[0].citation_id).toBe('C1');
    expect(data.citation_events[0].event_id).toBe('E1');
  });
});

// ─── Cascade Deletes ──────────────────────────────────────────────────────────

describe('Cascade deletes', () => {
  it('deleting a person cascades to events and relationships; citations remain orphaned', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.addPartner('R1', 'P1', 'P2');
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
    await h.createSource({ id: 'S1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });

    await h.deletePerson('P1');

    expect((await h.getStats()).events).toBe(0);
    expect((await h.getStats()).relationships).toBe(0);
    // Citation itself remains (junction rows are cascade-deleted via event)
    expect((await h.getStats()).citations).toBe(1);
    expect((await h.getStats()).sources).toBe(1);
  });

  it('deleting an event removes junction rows and participants; citation remains', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.createSource({ id: 'S1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    await h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2' });

    await h.deleteEvent('E1');

    // Citation preserved, junction rows gone
    expect(await h.getCitation('C1')).not.toBeNull();
    expect(await h.listCitationsForEvent('E1')).toHaveLength(0);
    expect(await h.getParticipantsForEvent('E1')).toHaveLength(0);
    expect(await h.getSource('S1')).not.toBeNull();
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('Stats', () => {
  it('getStats returns correct counts', async () => {
    expect(await h.getStats()).toEqual({ people: 0, events: 0, repositories: 0, sources: 0, citations: 0, relationships: 0, places: 0 });

    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1' });
    await h.addPartner('R1', 'P1', 'P2');

    expect(await h.getStats()).toEqual({ people: 2, events: 1, repositories: 0, sources: 0, citations: 0, relationships: 1, places: 0 });
  });
});

// ─── getPersonWithEvents ──────────────────────────────────────────────────────

describe('getPersonWithEvents', () => {
  it('returns null for missing person', async () => {
    expect(await h.getPersonWithEvents('MISSING')).toBeNull();
  });

  it('returns person with events, family, and citations', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    await h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    await h.addPartner('R1', 'P1', 'P2');
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900' });
    await h.createRepository({ id: 'REPO1', name: 'Ancestry' });
    await h.createSource({ id: 'S1', repository_id: 'REPO1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 5' });

    const result = await h.getPersonWithEvents('P1');
    expect(result.person.given_name).toBe('John');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].citations).toHaveLength(1);
    expect(result.events[0].citations[0].source_title).toBe('Census');
    expect(result.events[0].citations[0].repository_name).toBe('Ancestry');
    expect(result.events[0].citations[0].detail).toBe('p. 5');
    expect(result.partners).toHaveLength(1);
  });
});

// ─── Temporal Queries ────────────────────────────────────────────────────────

describe('Temporal queries', () => {
  it('findEventsNearDate returns events within window', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', sort_date: -2208988800000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '1970', sort_date: 0 });
    await h.createEvent({ id: 'E3', person_id: 'P1', type: 'residence', date: '1901', sort_date: -2177452800000 });

    const results = await h.findEventsNearDate(-2208988800000, 365 * 24 * 60 * 60 * 1000); // within 1 year of 1900
    expect(results.length).toBeGreaterThanOrEqual(2); // birth and residence
    expect(results.some(e => e.id === 'E1')).toBe(true);
    expect(results.some(e => e.id === 'E3')).toBe(true);
  });

  it('findEventsNearDate excludes events outside window', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', sort_date: -2208988800000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '1970', sort_date: 0 });

    const results = await h.findEventsNearDate(-2208988800000, 1000); // tiny window
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('E1');
  });

  it('findEventsNearDate respects excludePersonId', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P2', type: 'birth', sort_date: 1500 });

    const results = await h.findEventsNearDate(1000, 10000, { excludePersonId: 'P1' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('E2');
  });

  it('findEventsNearDate filters by personIds', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P2', type: 'birth', sort_date: 1500 });

    const results = await h.findEventsNearDate(1000, 10000, { personIds: ['P2'] });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('E2');
  });

  it('findEventsNearDate filters by eventTypes', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', sort_date: 1500 });

    const results = await h.findEventsNearDate(1000, 10000, { eventTypes: ['death'] });
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('death');
  });

  it('findEventsNearDate respects limit', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'residence', sort_date: 1001 });
    await h.createEvent({ id: 'E3', person_id: 'P1', type: 'death', sort_date: 1002 });

    const results = await h.findEventsNearDate(1000, 10000, { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('findEventsNearDate sorts by distance', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P1', type: 'residence', sort_date: 5000 });
    await h.createEvent({ id: 'E3', person_id: 'P1', type: 'death', sort_date: 2000 });

    const results = await h.findEventsNearDate(1000, 100000);
    // E1 (distance 0) should come first, then E3 (distance 1000), then E2 (distance 4000)
    expect(results[0].id).toBe('E1');
    expect(results[1].id).toBe('E3');
    expect(results[2].id).toBe('E2');
  });

  it('findEventsNearEvent finds events near another event', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createPerson({ id: 'P2', given_name: 'Mary' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', sort_date: 1000 });
    await h.createEvent({ id: 'E2', person_id: 'P2', type: 'birth', sort_date: 2000 });

    const results = await h.findEventsNearEvent('E1', 10000);
    // Should find E2 but not E1 (excludes same person)
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('E2');
  });

  it('findEventsNearEvent returns empty for missing event', async () => {
    expect(await h.findEventsNearEvent('MISSING', 10000)).toEqual([]);
  });

  it('findEventsNearEvent returns empty for event without sort_date', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' }); // no sort_date
    expect(await h.findEventsNearEvent('E1', 10000)).toEqual([]);
  });
});

// ─── Search Citations ────────────────────────────────────────────────────────

describe('searchCitations', () => {
  it('returns empty for null or empty query', async () => {
    expect(await h.searchCitations(null)).toEqual([]);
    expect(await h.searchCitations('')).toEqual([]);
    expect(await h.searchCitations('   ')).toEqual([]);
  });

  it('finds citations by source title', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
    await h.createSource({ id: 'S1', title: 'Census of Ireland 1901' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 5' });

    const results = await h.searchCitations('Census');
    expect(results).toHaveLength(1);
    expect(results[0].source_title).toBe('Census of Ireland 1901');
  });

  it('finds citations by citation detail', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
    await h.createSource({ id: 'S1', title: 'Records' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'Volume 12 Page 45' });

    const results = await h.searchCitations('Volume 12');
    expect(results).toHaveLength(1);
    expect(results[0].detail).toBe('Volume 12 Page 45');
  });

  it('finds citations by event place', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', place: 'Dublin' });
    await h.createSource({ id: 'S1', title: 'Records' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });

    const results = await h.searchCitations('Dublin');
    expect(results).toHaveLength(1);
  });

  it('includes repository_name in results', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
    await h.createRepository({ id: 'R1', name: 'National Archives' });
    await h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });

    const results = await h.searchCitations('Census');
    expect(results[0].repository_name).toBe('National Archives');
  });

  it('includes event_summary in results', async () => {
    await h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    await h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', place: 'Dublin' });
    await h.createSource({ id: 'S1', title: 'Census' });
    await h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });

    const results = await h.searchCitations('Census');
    expect(results[0].event_summary).toContain('birth');
    expect(results[0].event_summary).toContain('1900');
    expect(results[0].event_summary).toContain('Dublin');
    expect(results[0].event_summary).toContain('John Smith');
  });
});
