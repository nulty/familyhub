import { describe, it, expect } from 'vitest';
import { parseGEDCOM } from './import.js';

describe('parseGEDCOM', () => {
  it('parses a minimal individual', () => {
    const ged = `0 HEAD
1 SOUR Test
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

  it('parses name without slashes', () => {
    const ged = `0 @I1@ INDI
1 NAME Jane Doe
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].given_name).toBe('Jane');
    expect(data.people[0].surname).toBe('Doe');
  });

  it('defaults gender to U when SEX is missing', () => {
    const ged = `0 @I1@ INDI
1 NAME Pat /Lee/
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].gender).toBe('U');
  });

  it('parses female gender', () => {
    const ged = `0 @I1@ INDI
1 NAME Mary /Jones/
1 SEX F
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].gender).toBe('F');
  });

  it('parses birth event with date and place', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 3 SEP 1913
2 PLAC Dublin, Ireland
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.events).toBe(1);
    expect(data.events[0].type).toBe('birth');
    expect(data.events[0].date).toBe('3 SEP 1913');
    expect(data.events[0].place).toBe('Dublin, Ireland');
    expect(data.events[0].sort_date).toBe(Date.UTC(1913, 8, 3));
  });

  it('creates partner relationship from FAM with HUSB and WIFE', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.relationships).toBe(1);
    expect(data.relationships[0].type).toBe('partner');
  });

  it('creates parent-child relationships from FAM with CHIL', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @I3@ INDI
1 NAME Tom /Smith/
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    const parentChildRels = data.relationships.filter(r => r.type === 'parent_child');
    expect(parentChildRels).toHaveLength(2); // one per parent
  });

  it('creates marriage events for both spouses', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
0 @I2@ INDI
1 NAME Mary /Jones/
1 SEX F
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 MARR
2 DATE 15 JUN 1935
2 PLAC Dublin
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    const marriages = data.events.filter(e => e.type === 'marriage');
    expect(marriages).toHaveLength(2); // one per spouse
    expect(marriages[0].date).toBe('15 JUN 1935');
  });

  it('parses sources on events', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1901
2 SOUR https://example.com/record
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.sources).toBe(1);
    expect(data.sources[0].url).toBe('https://example.com/record');
  });

  it('parses NOTE with CONT continuation', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 NOTE First line
2 CONT Second line
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    expect(data.people[0].notes).toBe('First line\nSecond line');
  });

  it('stats match data array lengths', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
1 BIRT
2 DATE 1900
0 TRLR`;
    const { data, stats } = parseGEDCOM(ged);
    expect(stats.people).toBe(data.people.length);
    expect(stats.events).toBe(data.events.length);
    expect(stats.relationships).toBe(data.relationships.length);
    expect(stats.sources).toBe(data.sources.length);
  });

  it('handles empty input without crashing', () => {
    const { data, stats } = parseGEDCOM('');
    expect(stats.people).toBe(0);
    expect(data.people).toEqual([]);
  });

  it('assigns unique IDs to all records', () => {
    const ged = `0 @I1@ INDI
1 NAME John /Smith/
0 @I2@ INDI
1 NAME Mary /Jones/
0 TRLR`;
    const { data } = parseGEDCOM(ged);
    const ids = data.people.map(p => p.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids[0]).toHaveLength(26); // ULID length
  });
});
