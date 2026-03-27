import { describe, it, expect } from 'vitest';
import { parseGEDCOM } from '../src/gedcom/import.js';
import { setupTestDB } from './db-helpers.js';

// ─── Parser ──────────────────────────────────────────────────────────────────

describe('parseGEDCOM', () => {
  it('parses a minimal individual', () => {
    const ged = `0 HEAD
1 CHAR UTF-8
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.people).toBe(1);
    expect(data.people[0].given_name).toBe('John');
    expect(data.people[0].surname).toBe('Smith');
    expect(data.people[0].gender).toBe('M');
  });

  it('parses birth and death events', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Jane /Doe/
1 SEX F
1 BIRT
2 DATE 3 MAR 1901
2 PLAC Dublin, Ireland
1 DEAT
2 DATE 15 JUN 1980
2 PLAC Cork, Ireland
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.events).toBe(2);
    expect(data.events[0].type).toBe('birth');
    expect(data.events[0].date).toBe('3 MAR 1901');
    expect(data.events[0].place).toBe('Dublin, Ireland');
    expect(data.events[1].type).toBe('death');
    expect(data.events[1].date).toBe('15 JUN 1980');
  });

  it('parses family relationships', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @I3@ INDI
1 NAME Tom /Smith/
1 SEX M
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.people).toBe(3);
    expect(stats.relationships).toBe(3); // 1 partner + 2 parent-child
    const partner = data.relationships.find(r => r.type === 'partner');
    expect(partner).toBeDefined();
    const parentChild = data.relationships.filter(r => r.type === 'parent_child');
    expect(parentChild).toHaveLength(2);
  });

  it('parses marriage as shared event with both spouses as participants', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 5 JUN 1920
2 PLAC Dublin
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    const marriages = data.events.filter(e => e.type === 'marriage');
    expect(marriages).toHaveLength(1);
    expect(marriages[0].person_id).toBeNull();
    expect(marriages[0].date).toBe('5 JUN 1920');
    const marrParticipants = data.participants.filter(p => p.event_id === marriages[0].id);
    expect(marrParticipants).toHaveLength(2);
    expect(marrParticipants.every(p => p.role === 'spouse')).toBe(true);
  });

  it('parses inline sources and creates citations', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1900
2 SOUR Civil Birth Records
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.sources).toBe(1);
    expect(stats.citations).toBe(1);
    expect(data.sources[0].title).toBe('Civil Birth Records');
    expect(data.citations[0].source_id).toBe(data.sources[0].id);
    expect(data.citations[0].event_id).toBe(data.events[0].id);
  });

  it('parses URL sources and creates repositories', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1900
2 SOUR https://civilrecords.irishgenealogy.ie/churchrecords/details/birth
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.repositories).toBe(1);
    expect(data.repositories[0].name).toBe('General Register Office');
    expect(stats.sources).toBe(1);
    expect(stats.citations).toBe(1);
  });

  it('deduplicates repositories by domain', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1900
2 SOUR https://civilrecords.irishgenealogy.ie/birth/1
1 DEAT
2 DATE 1970
2 SOUR https://civilrecords.irishgenealogy.ie/death/1
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.repositories).toBe(1);
    expect(stats.citations).toBe(2);
  });

  it('creates flat place records from event places', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 PLAC Dublin, Ireland
1 RESI
2 PLAC Cork, Ireland
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.places).toBe(2);
    expect(data.places.map(p => p.name).sort()).toEqual(['Cork, Ireland', 'Dublin, Ireland']);
    // Events should have place_id set
    for (const ev of data.events) {
      expect(ev.place_id).toBeTruthy();
    }
  });

  it('deduplicates places with same name', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 PLAC Dublin, Ireland
1 RESI
2 PLAC Dublin, Ireland
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.places).toBe(1);
    expect(data.events[0].place_id).toBe(data.events[1].place_id);
  });

  it('parses notes with continuations', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 NOTE First line
2 CONT Second line
2 CONC appended
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].notes).toBe('First line\nSecond lineappended');
  });

  it('defaults gender to U when missing', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME Pat /Smith/
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].gender).toBe('U');
  });

  it('handles name without slashes', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John Smith
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].given_name).toBe('John');
    expect(data.people[0].surname).toBe('Smith');
  });

  it('parses event associations with roles', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
1 BIRT
2 DATE 1900
2 ASSO @I1@
3 RELA godfather
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.participants).toBe(1);
    expect(data.participants[0].role).toBe('godfather');
  });

  it('parses multiple event types', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1900
1 RESI
2 DATE 1920
2 PLAC London
1 EMIG
2 DATE 1925
1 IMMI
2 DATE 1925
1 CENS
2 DATE 1930
1 BURI
2 DATE 1980
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    const types = data.events.map(e => e.type);
    expect(types).toContain('birth');
    expect(types).toContain('residence');
    expect(types).toContain('emigration');
    expect(types).toContain('immigration');
    expect(types).toContain('census');
    expect(types).toContain('burial');
  });
});

// ─── Database round-trip ─────────────────────────────────────────────────────

describe('GEDCOM → bulkImport round-trip', () => {
  it('imports parsed GEDCOM data into the database', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 3 MAR 1901
2 PLAC Dublin, Ireland
2 SOUR https://civilrecords.irishgenealogy.ie/birth/123
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
1 BIRT
2 DATE 1905
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 @I3@ INDI
1 NAME Tom /Smith/
1 SEX M
1 BIRT
2 DATE 1925
0 TRLR`;

    const { data, stats } = parseGEDCOM(ged);
    const { handlers: h } = setupTestDB();
    const counts = h.bulkImport(data);

    expect(counts.people).toBe(3);
    expect(counts.events).toBe(3);
    expect(counts.relationships).toBe(3);
    expect(counts.repositories).toBe(1);
    expect(counts.sources).toBe(1);
    expect(counts.citations).toBe(1);
    expect(counts.places).toBe(1);

    // Verify data is queryable
    const dbStats = h.getStats();
    expect(dbStats.people).toBe(3);
    expect(dbStats.events).toBe(3);
    expect(dbStats.repositories).toBe(1);
    expect(dbStats.sources).toBe(1);
    expect(dbStats.citations).toBe(1);
    expect(dbStats.places).toBe(1);
  });

  it('round-trips through export and re-import', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1901
2 PLAC Dublin
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 1920
0 TRLR`;

    const { data } = parseGEDCOM(ged);
    const { handlers: h1 } = setupTestDB();
    h1.bulkImport(data);
    const exported = h1.exportAll();

    // Import into a fresh DB
    const { handlers: h2 } = setupTestDB();
    const counts = h2.bulkImport(exported);

    expect(counts.people).toBe(2);
    expect(counts.relationships).toBe(1);
    expect(counts.events).toBe(2); // 1 birth + 1 marriage (shared)
  });

  it('import is idempotent with OR REPLACE/IGNORE', () => {
    const ged = `0 HEAD
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 1901
0 TRLR`;

    const { data } = parseGEDCOM(ged);
    const { handlers: h } = setupTestDB();
    h.bulkImport(data);
    // Import same data again — should not fail or duplicate
    h.bulkImport(data);

    expect(h.getStats().people).toBe(1);
    expect(h.getStats().events).toBe(1);
  });

  it('handles empty GEDCOM gracefully', () => {
    const ged = `0 HEAD
1 CHAR UTF-8
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.people).toBe(0);

    const { handlers: h } = setupTestDB();
    const counts = h.bulkImport(data);
    expect(counts.people).toBe(0);
  });
});
