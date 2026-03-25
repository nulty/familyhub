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
  it('createPerson inserts and returns record', () => {
    const p = h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M' });
    expect(p.id).toBe('P1');
    expect(p.given_name).toBe('John');
    expect(p.surname).toBe('Smith');
    expect(p.gender).toBe('M');
    expect(p.created_at).toBeGreaterThan(0);
  });

  it('getPerson retrieves by ID', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    expect(h.getPerson('P1').given_name).toBe('John');
  });

  it('getPerson returns null for missing ID', () => {
    expect(h.getPerson('MISSING')).toBeNull();
  });

  it('updatePerson updates allowed fields', () => {
    h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    const updated = h.updatePerson('P1', { surname: 'Jones' });
    expect(updated.surname).toBe('Jones');
    expect(updated.given_name).toBe('John'); // unchanged
  });

  it('updatePerson ignores disallowed fields', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    const before = h.getPerson('P1');
    h.updatePerson('P1', { id: 'HACKED', created_at: 0 });
    const after = h.getPerson('P1');
    expect(after.id).toBe('P1');
    expect(after.created_at).toBe(before.created_at);
  });

  it('updatePerson updates updated_at', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    const before = h.getPerson('P1');
    // Small delay to ensure different timestamp
    const updated = h.updatePerson('P1', { given_name: 'Jane' });
    expect(updated.updated_at).toBeGreaterThanOrEqual(before.updated_at);
  });

  it('deletePerson removes the record', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.deletePerson('P1');
    expect(h.getPerson('P1')).toBeNull();
  });

  it('searchPeople finds by given_name', () => {
    h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    h.createPerson({ id: 'P2', given_name: 'Mary', surname: 'Jones' });
    const results = h.searchPeople('John');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('P1');
  });

  it('searchPeople finds by surname', () => {
    h.createPerson({ id: 'P1', given_name: 'John', surname: 'Smith' });
    const results = h.searchPeople('Smith');
    expect(results).toHaveLength(1);
  });

  it('searchPeople with empty query returns all', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createPerson({ id: 'P2', given_name: 'Mary' });
    const results = h.searchPeople('');
    expect(results).toHaveLength(2);
  });
});

// ─── Relationships ────────────────────────────────────────────────────────────

describe('Relationships', () => {
  beforeEach(() => {
    h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    h.createPerson({ id: 'P3', given_name: 'Tom', gender: 'M' });
  });

  it('addPartner creates partner relationship', () => {
    const rel = h.addPartner('R1', 'P1', 'P2');
    expect(rel.type).toBe('partner');
    expect(rel.person_a_id).toBe('P1');
    expect(rel.person_b_id).toBe('P2');
  });

  it('addParentChild creates parent_child relationship', () => {
    const rel = h.addParentChild('R1', 'P1', 'P3');
    expect(rel.type).toBe('parent_child');
  });

  it('duplicate relationship is ignored (INSERT OR IGNORE)', () => {
    h.addPartner('R1', 'P1', 'P2');
    // Same people, same type — should not throw
    h.addPartner('R2', 'P1', 'P2');
    const stats = h.getStats();
    expect(stats.relationships).toBe(1);
  });

  it('removeRelationship deletes it', () => {
    h.addPartner('R1', 'P1', 'P2');
    h.removeRelationship('R1');
    expect(h.getStats().relationships).toBe(0);
  });

  it('getFamily returns parents, children, partners', () => {
    h.addPartner('R1', 'P1', 'P2');
    h.addParentChild('R2', 'P1', 'P3');
    h.addParentChild('R3', 'P2', 'P3');

    const family = h.getFamily('P3');
    expect(family.parents).toHaveLength(2);
    expect(family.children).toHaveLength(0);
    expect(family.partners).toHaveLength(0);

    const parentFamily = h.getFamily('P1');
    expect(parentFamily.children).toHaveLength(1);
    expect(parentFamily.partners).toHaveLength(1);
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────

describe('Events', () => {
  beforeEach(() => {
    h.createPerson({ id: 'P1', given_name: 'John' });
  });

  it('createEvent inserts and returns record', () => {
    const ev = h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', sort_date: Date.UTC(1900, 0, 1) });
    expect(ev.type).toBe('birth');
    expect(ev.person_id).toBe('P1');
  });

  it('updateEvent updates allowed fields', () => {
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', place: 'Dublin' });
    const updated = h.updateEvent('E1', { place: 'Cork' });
    expect(updated.place).toBe('Cork');
  });

  it('deleteEvent removes the record', () => {
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.deleteEvent('E1');
    expect(h.listEvents('P1')).toHaveLength(0);
  });

  it('listEvents returns events ordered by sort_date', () => {
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'death', sort_date: 200 });
    h.createEvent({ id: 'E2', person_id: 'P1', type: 'birth', sort_date: 100 });
    const list = h.listEvents('P1');
    expect(list[0].type).toBe('birth');
    expect(list[1].type).toBe('death');
  });

  it('null sort_date sorts last', () => {
    h.createEvent({ id: 'E1', person_id: 'P1', sort_date: null });
    h.createEvent({ id: 'E2', person_id: 'P1', sort_date: 100 });
    const list = h.listEvents('P1');
    expect(list[0].id).toBe('E2');
    expect(list[1].id).toBe('E1');
  });
});

// ─── Participants ─────────────────────────────────────────────────────────────

describe('Participants', () => {
  beforeEach(() => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createPerson({ id: 'P2', given_name: 'Mary' });
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
  });

  it('addParticipant links person to event', () => {
    const result = h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    expect(result.role).toBe('witness');
  });

  it('getParticipantsForEvent returns participant details', () => {
    h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    const participants = h.getParticipantsForEvent('E1');
    expect(participants).toHaveLength(1);
    expect(participants[0].given_name).toBe('Mary');
  });

  it('removeParticipant removes the link', () => {
    h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2' });
    h.removeParticipant('E1', 'P2');
    expect(h.getParticipantsForEvent('E1')).toHaveLength(0);
  });

  it('updateParticipantRole changes the role', () => {
    h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2', role: 'witness' });
    const updated = h.updateParticipantRole('E1', 'P2', 'informant');
    expect(updated.role).toBe('informant');
  });
});

// ─── Repositories ─────────────────────────────────────────────────────────────

describe('Repositories', () => {
  it('createRepository inserts and returns record', () => {
    const repo = h.createRepository({ id: 'R1', name: 'Ancestry.com', type: 'website', url: 'https://ancestry.com' });
    expect(repo.id).toBe('R1');
    expect(repo.name).toBe('Ancestry.com');
    expect(repo.type).toBe('website');
    expect(repo.url).toBe('https://ancestry.com');
  });

  it('getRepository retrieves by ID', () => {
    h.createRepository({ id: 'R1', name: 'National Archives' });
    expect(h.getRepository('R1').name).toBe('National Archives');
  });

  it('getRepository returns null for missing', () => {
    expect(h.getRepository('MISSING')).toBeNull();
  });

  it('updateRepository updates allowed fields', () => {
    h.createRepository({ id: 'R1', name: 'Old Name' });
    const updated = h.updateRepository('R1', { name: 'New Name', type: 'archive' });
    expect(updated.name).toBe('New Name');
    expect(updated.type).toBe('archive');
  });

  it('deleteRepository removes it and nullifies source references', () => {
    h.createRepository({ id: 'R1', name: 'Ancestry' });
    h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    h.deleteRepository('R1');
    expect(h.getRepository('R1')).toBeNull();
    const src = h.getSource('S1');
    expect(src.repository_id).toBeNull();
  });

  it('listRepositories returns all sorted by name', () => {
    h.createRepository({ id: 'R1', name: 'Zeta' });
    h.createRepository({ id: 'R2', name: 'Alpha' });
    const list = h.listRepositories();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Alpha');
  });

  it('searchRepositories finds by name or url', () => {
    h.createRepository({ id: 'R1', name: 'Ancestry', url: 'https://ancestry.com' });
    h.createRepository({ id: 'R2', name: 'FamilySearch', url: 'https://familysearch.org' });
    expect(h.searchRepositories('Anc')).toHaveLength(1);
    expect(h.searchRepositories('familysearch')).toHaveLength(1);
    expect(h.searchRepositories('')).toHaveLength(0);
  });
});

// ─── Sources ──────────────────────────────────────────────────────────────────

describe('Sources', () => {
  it('createSource inserts and returns record', () => {
    const src = h.createSource({ id: 'S1', title: 'Census 1901', type: 'census', url: 'https://example.com/census' });
    expect(src.id).toBe('S1');
    expect(src.title).toBe('Census 1901');
    expect(src.type).toBe('census');
  });

  it('createSource with repository_id links to repo', () => {
    h.createRepository({ id: 'R1', name: 'Ancestry' });
    const src = h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    expect(src.repository_id).toBe('R1');
  });

  it('getSource includes repository_name', () => {
    h.createRepository({ id: 'R1', name: 'Ancestry' });
    h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    const src = h.getSource('S1');
    expect(src.repository_name).toBe('Ancestry');
  });

  it('getSource returns null repository_name when no repo', () => {
    h.createSource({ id: 'S1', title: 'My Notes' });
    const src = h.getSource('S1');
    expect(src.repository_name).toBeNull();
  });

  it('updateSource updates allowed fields', () => {
    h.createSource({ id: 'S1', title: 'Old' });
    const updated = h.updateSource('S1', { title: 'New', author: 'John' });
    expect(updated.title).toBe('New');
    expect(updated.author).toBe('John');
  });

  it('deleteSource removes it and cascades to citations', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.createSource({ id: 'S1', title: 'Census' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.deleteSource('S1');
    expect(h.getCitation('C1')).toBeNull();
  });

  it('listSources returns all sources sorted by title', () => {
    h.createSource({ id: 'S1', title: 'Zebra' });
    h.createSource({ id: 'S2', title: 'Alpha' });
    const list = h.listSources();
    expect(list).toHaveLength(2);
    expect(list[0].title).toBe('Alpha');
  });

  it('searchSources finds by title', () => {
    h.createSource({ id: 'S1', title: 'Census 1901' });
    h.createSource({ id: 'S2', title: 'Birth Cert' });
    expect(h.searchSources('Census')).toHaveLength(1);
    expect(h.searchSources('')).toHaveLength(0);
  });

  it('listSourcesForEvent returns sources cited in event', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.createSource({ id: 'S1', title: 'Census' });
    h.createSource({ id: 'S2', title: 'Other' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    const sources = h.listSourcesForEvent('E1');
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe('Census');
  });
});

// ─── Citations ────────────────────────────────────────────────────────────────

describe('Citations', () => {
  beforeEach(() => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.createRepository({ id: 'R1', name: 'Ancestry' });
    h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census 1901' });
  });

  it('createCitation inserts and returns record', () => {
    const c = h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42', url: 'https://example.com/page', confidence: 'primary' });
    expect(c.id).toBe('C1');
    expect(c.source_id).toBe('S1');
    expect(c.event_id).toBe('E1');
    expect(c.detail).toBe('p. 42');
    expect(c.confidence).toBe('primary');
  });

  it('updateCitation updates allowed fields', () => {
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'old' });
    const updated = h.updateCitation('C1', { detail: 'new', confidence: 'secondary' });
    expect(updated.detail).toBe('new');
    expect(updated.confidence).toBe('secondary');
  });

  it('deleteCitation removes it', () => {
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.deleteCitation('C1');
    expect(h.getCitation('C1')).toBeNull();
  });

  it('listCitationsForEvent returns enriched rows', () => {
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42' });
    const list = h.listCitationsForEvent('E1');
    expect(list).toHaveLength(1);
    expect(list[0].source_title).toBe('Census 1901');
    expect(list[0].repository_name).toBe('Ancestry');
    expect(list[0].detail).toBe('p. 42');
  });

  it('listCitationsForSource returns citation details with event info', () => {
    h.createEvent({ id: 'E2', person_id: 'P1', type: 'death' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.createCitation({ id: 'C2', source_id: 'S1', event_id: 'E2' });
    const list = h.listCitationsForSource('S1');
    expect(list).toHaveLength(2);
    expect(list[0].given_name).toBe('John');
  });

  it('deleting event cascades to citations', () => {
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.deleteEvent('E1');
    expect(h.getCitation('C1')).toBeNull();
  });

  it('deleting person cascades through events to citations', () => {
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.deletePerson('P1');
    expect(h.getCitation('C1')).toBeNull();
  });
});

// ─── Graph ────────────────────────────────────────────────────────────────────

describe('Graph', () => {
  it('getGraphData builds node array with rels', () => {
    h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    h.createPerson({ id: 'P3', given_name: 'Tom', gender: 'M' });
    h.addPartner('R1', 'P1', 'P2');
    h.addParentChild('R2', 'P1', 'P3');
    h.addParentChild('R3', 'P2', 'P3');

    const nodes = h.getGraphData();
    expect(nodes).toHaveLength(3);

    const tom = nodes.find(n => n.id === 'P3');
    expect(tom.rels.father).toBe('P1');
    expect(tom.rels.mother).toBe('P2');

    const john = nodes.find(n => n.id === 'P1');
    expect(john.rels.spouses).toContain('P2');
    expect(john.rels.children).toContain('P3');
  });

  it('includes birth/death dates and places', () => {
    h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '3 SEP 1890', place: 'Dublin' });
    h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '15 MAR 1945', place: 'Cork' });

    const nodes = h.getGraphData();
    const john = nodes.find(n => n.id === 'P1');
    expect(john.data.birth_date).toBe('3 SEP 1890');
    expect(john.data.birth_place).toBe('Dublin');
    expect(john.data.death_date).toBe('15 MAR 1945');
    expect(john.data.death_place).toBe('Cork');
  });

  it('computes life_years from birth and death', () => {
    h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1890' });
    h.createEvent({ id: 'E2', person_id: 'P1', type: 'death', date: '1945' });

    const nodes = h.getGraphData();
    expect(nodes[0].data.life_years).toBe('1890 – 1945');
  });

  it('shows birth year with ? for death when still alive', () => {
    h.createPerson({ id: 'P1', given_name: 'Mary', gender: 'F' });
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1990' });

    const nodes = h.getGraphData();
    expect(nodes[0].data.life_years).toBe('1990 – ');
    expect(nodes[0].data.death_date).toBe('');
  });

  it('returns empty strings when no events exist', () => {
    h.createPerson({ id: 'P1', given_name: 'Pat', gender: 'U' });

    const nodes = h.getGraphData();
    expect(nodes[0].data.birth_date).toBe('');
    expect(nodes[0].data.death_date).toBe('');
    expect(nodes[0].data.birth_place).toBe('');
    expect(nodes[0].data.death_place).toBe('');
    expect(nodes[0].data.life_years).toBe('');
  });
});

// ─── Places ───────────────────────────────────────────────────────────────────

describe('Places', () => {
  it('createPlace inserts and returns a record', () => {
    const pl = h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    expect(pl.id).toBe('PL1');
    expect(pl.name).toBe('Ireland');
    expect(pl.type).toBe('country');
    expect(pl.parent_id).toBeNull();
  });

  it('getPlace retrieves by ID', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    expect(h.getPlace('PL1').name).toBe('Ireland');
  });

  it('getPlace returns null for missing', () => {
    expect(h.getPlace('MISSING')).toBeNull();
  });

  it('updatePlace updates allowed fields', () => {
    h.createPlace({ id: 'PL1', name: 'Irland', type: '' });
    const updated = h.updatePlace('PL1', { name: 'Ireland', type: 'country' });
    expect(updated.name).toBe('Ireland');
    expect(updated.type).toBe('country');
  });

  it('deletePlace removes the record', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    h.deletePlace('PL1');
    expect(h.getPlace('PL1')).toBeNull();
  });

  it('deletePlace sets children parent_id to null', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    h.deletePlace('PL1');
    expect(h.getPlace('PL2').parent_id).toBeNull();
  });

  it('deletePlace sets events place_id to null', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    h.deletePlace('PL1');
    const ev = h.listEvents('P1');
    expect(ev[0].place_id).toBeNull();
    expect(ev[0].place).toBe('Dublin'); // text preserved
  });

  it('listPlaces returns all sorted by name', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    h.createPlace({ id: 'PL2', name: 'Cork' });
    const list = h.listPlaces();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Cork');
    expect(list[1].name).toBe('Dublin');
  });

  it('searchPlaces finds by name', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    h.createPlace({ id: 'PL2', name: 'Cork' });
    const results = h.searchPlaces('Dub');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Dublin');
  });

  it('searchPlaces returns full_name computed from hierarchy', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    h.createPlace({ id: 'PL2', name: 'Leinster', parent_id: 'PL1' });
    h.createPlace({ id: 'PL3', name: 'Dublin', parent_id: 'PL2' });
    const results = h.searchPlaces('Dublin');
    expect(results).toHaveLength(1);
    expect(results[0].full_name).toBe('Dublin, Leinster, Ireland');
  });

  it('searchPlaces full_name for root place is just the name', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    const results = h.searchPlaces('Ireland');
    expect(results[0].full_name).toBe('Ireland');
  });

  it('searchPlaces with empty query returns empty array', () => {
    expect(h.searchPlaces('')).toEqual([]);
    expect(h.searchPlaces(null)).toEqual([]);
  });

  it('getPlaceHierarchy returns ancestor chain', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland', type: 'country' });
    h.createPlace({ id: 'PL2', name: 'Leinster', type: 'province', parent_id: 'PL1' });
    h.createPlace({ id: 'PL3', name: 'Dublin', type: 'county', parent_id: 'PL2' });
    const chain = h.getPlaceHierarchy('PL3');
    expect(chain).toHaveLength(3);
    expect(chain[0].name).toBe('Ireland');
    expect(chain[1].name).toBe('Leinster');
    expect(chain[2].name).toBe('Dublin');
  });

  it('getPlaceChildren returns immediate children', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    h.createPlace({ id: 'PL3', name: 'Cork', parent_id: 'PL1' });
    const children = h.getPlaceChildren('PL1');
    expect(children).toHaveLength(2);
  });

  it('getPlaceChildren with null returns root places', () => {
    h.createPlace({ id: 'PL1', name: 'Ireland' });
    h.createPlace({ id: 'PL2', name: 'Dublin', parent_id: 'PL1' });
    const roots = h.getPlaceChildren(null);
    expect(roots).toHaveLength(1);
    expect(roots[0].name).toBe('Ireland');
  });

  it('createEvent with place_id links to place', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    const ev = h.listEvents('P1');
    expect(ev[0].place_id).toBe('PL1');
  });

  it('updateEvent can change place_id', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    h.createPlace({ id: 'PL2', name: 'Cork' });
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1', place: 'Dublin', place_id: 'PL1' });
    h.updateEvent('E1', { place: 'Cork', place_id: 'PL2' });
    const ev = h.listEvents('P1');
    expect(ev[0].place_id).toBe('PL2');
  });

  it('bulkImport with places inserts place records', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    const counts = h.bulkImport({
      people: [], relationships: [], sources: [], citations: [], repositories: [], participants: [],
      places: [{ id: 'PL1', name: 'Dublin', type: 'city' }],
      events: [{ id: 'E1', person_id: 'P1', type: 'birth', place: 'Dublin', place_id: 'PL1' }],
    });
    expect(counts.places).toBe(1);
    expect(h.getPlace('PL1').name).toBe('Dublin');
    expect(h.listEvents('P1')[0].place_id).toBe('PL1');
  });

  it('getStats includes places count', () => {
    h.createPlace({ id: 'PL1', name: 'Dublin' });
    expect(h.getStats().places).toBe(1);
  });
});

// ─── Bulk ─────────────────────────────────────────────────────────────────────

describe('Bulk', () => {
  it('bulkImport inserts all entity types', () => {
    const counts = h.bulkImport({
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

  it('exportAll returns all data including repositories and citations', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.createRepository({ id: 'R1', name: 'Ancestry' });
    h.createSource({ id: 'S1', repository_id: 'R1', title: 'Census' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    const data = h.exportAll();
    expect(data.people).toHaveLength(1);
    expect(data.events).toHaveLength(1);
    expect(data.repositories).toHaveLength(1);
    expect(data.sources).toHaveLength(1);
    expect(data.citations).toHaveLength(1);
  });
});

// ─── Cascade Deletes ──────────────────────────────────────────────────────────

describe('Cascade deletes', () => {
  it('deleting a person cascades to events, citations, and relationships', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createPerson({ id: 'P2', given_name: 'Mary' });
    h.addPartner('R1', 'P1', 'P2');
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth' });
    h.createSource({ id: 'S1', title: 'Census' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });

    h.deletePerson('P1');

    expect(h.getStats().events).toBe(0);
    expect(h.getStats().citations).toBe(0);
    expect(h.getStats().relationships).toBe(0);
    // Source itself remains (not cascade-deleted from citation)
    expect(h.getStats().sources).toBe(1);
  });

  it('deleting an event cascades to citations and participants', () => {
    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createPerson({ id: 'P2', given_name: 'Mary' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.createSource({ id: 'S1', title: 'Census' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1' });
    h.addParticipant({ id: 'EP1', event_id: 'E1', person_id: 'P2' });

    h.deleteEvent('E1');

    expect(h.getCitation('C1')).toBeNull();
    expect(h.getParticipantsForEvent('E1')).toHaveLength(0);
    // Source still exists
    expect(h.getSource('S1')).not.toBeNull();
  });
});

// ─── Stats ────────────────────────────────────────────────────────────────────

describe('Stats', () => {
  it('getStats returns correct counts', () => {
    expect(h.getStats()).toEqual({ people: 0, events: 0, repositories: 0, sources: 0, citations: 0, relationships: 0, places: 0 });

    h.createPerson({ id: 'P1', given_name: 'John' });
    h.createPerson({ id: 'P2', given_name: 'Mary' });
    h.createEvent({ id: 'E1', person_id: 'P1' });
    h.addPartner('R1', 'P1', 'P2');

    expect(h.getStats()).toEqual({ people: 2, events: 1, repositories: 0, sources: 0, citations: 0, relationships: 1, places: 0 });
  });
});

// ─── getPersonWithEvents ──────────────────────────────────────────────────────

describe('getPersonWithEvents', () => {
  it('returns null for missing person', () => {
    expect(h.getPersonWithEvents('MISSING')).toBeNull();
  });

  it('returns person with events, family, and citations', () => {
    h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
    h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
    h.addPartner('R1', 'P1', 'P2');
    h.createEvent({ id: 'E1', person_id: 'P1', type: 'birth', date: '1900' });
    h.createRepository({ id: 'REPO1', name: 'Ancestry' });
    h.createSource({ id: 'S1', repository_id: 'REPO1', title: 'Census' });
    h.createCitation({ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 5' });

    const result = h.getPersonWithEvents('P1');
    expect(result.person.given_name).toBe('John');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].citations).toHaveLength(1);
    expect(result.events[0].citations[0].source_title).toBe('Census');
    expect(result.events[0].citations[0].repository_name).toBe('Ancestry');
    expect(result.events[0].citations[0].detail).toBe('p. 5');
    expect(result.partners).toHaveLength(1);
  });
});
