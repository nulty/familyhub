import { describe, it, expect } from 'vitest';
import { exportGEDCOM } from './export.js';
import { parseGEDCOM } from './import.js';

describe('exportGEDCOM', () => {
  it('produces HEAD and TRLR', () => {
    const text = exportGEDCOM({ people: [], relationships: [], events: [], sources: [], citations: [], participants: [] });
    expect(text).toMatch(/^0 HEAD/);
    expect(text).toMatch(/0 TRLR$/);
  });

  it('exports a person as INDI with NAME', () => {
    const text = exportGEDCOM({
      people: [{ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' }],
      relationships: [], events: [], sources: [], citations: [], participants: [],
    });
    expect(text).toContain('0 @P1@ INDI');
    expect(text).toContain('1 NAME John /Smith/');
    expect(text).toContain('1 SEX M');
  });

  it('omits SEX line for gender U', () => {
    const text = exportGEDCOM({
      people: [{ id: 'P1', given_name: 'Pat', surname: 'Lee', gender: 'U', notes: '' }],
      relationships: [], events: [], sources: [], citations: [], participants: [],
    });
    expect(text).not.toContain('SEX');
  });

  it('exports birth event with DATE and PLAC', () => {
    const text = exportGEDCOM({
      people: [{ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' }],
      relationships: [],
      events: [{ id: 'E1', person_id: 'P1', type: 'birth', date: '3 SEP 1913', place: 'Dublin', notes: '' }],
      sources: [], participants: [],
    });
    expect(text).toContain('1 BIRT');
    expect(text).toContain('2 DATE 3 SEP 1913');
    expect(text).toContain('2 PLAC Dublin');
  });

  it('exports partner relationship as FAM with HUSB/WIFE', () => {
    const text = exportGEDCOM({
      people: [
        { id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' },
        { id: 'P2', given_name: 'Mary', surname: 'Jones', gender: 'F', notes: '' },
      ],
      relationships: [{ id: 'R1', person_a_id: 'P1', person_b_id: 'P2', type: 'partner' }],
      events: [], sources: [], participants: [],
    });
    expect(text).toMatch(/0 @F\d+@ FAM/);
    expect(text).toContain('1 HUSB @P1@');
    expect(text).toContain('1 WIFE @P2@');
  });

  it('exports parent-child as CHIL in FAM', () => {
    const text = exportGEDCOM({
      people: [
        { id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' },
        { id: 'P2', given_name: 'Mary', surname: 'Jones', gender: 'F', notes: '' },
        { id: 'P3', given_name: 'Tom', surname: 'Smith', gender: 'M', notes: '' },
      ],
      relationships: [
        { id: 'R1', person_a_id: 'P1', person_b_id: 'P2', type: 'partner' },
        { id: 'R2', person_a_id: 'P1', person_b_id: 'P3', type: 'parent_child' },
      ],
      events: [], sources: [], participants: [],
    });
    expect(text).toContain('1 CHIL @P3@');
    expect(text).toContain('1 FAMC @');
  });

  it('exports citations as SOUR lines', () => {
    const text = exportGEDCOM({
      people: [{ id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' }],
      relationships: [],
      events: [{ id: 'E1', person_id: 'P1', type: 'birth', date: '1900', place: '', notes: '' }],
      sources: [{ id: 'S1', title: 'Census', url: 'https://example.com' }],
      citations: [{ id: 'C1', source_id: 'S1', event_id: 'E1', detail: 'p. 42', url: '', accessed: '' }],
      participants: [],
    });
    expect(text).toContain('2 SOUR https://example.com');
    expect(text).toContain('3 PAGE p. 42');
  });

  it('round-trips key fields through export then import', () => {
    const originalData = {
      people: [
        { id: 'P1', given_name: 'John', surname: 'Smith', gender: 'M', notes: '' },
        { id: 'P2', given_name: 'Mary', surname: 'Jones', gender: 'F', notes: '' },
      ],
      relationships: [
        { id: 'R1', person_a_id: 'P1', person_b_id: 'P2', type: 'partner' },
      ],
      events: [
        { id: 'E1', person_id: 'P1', type: 'birth', date: '3 SEP 1913', place: 'Dublin', notes: '' },
      ],
      sources: [],
      citations: [],
      participants: [],
    };

    const gedText = exportGEDCOM(originalData);
    const { data } = parseGEDCOM(gedText);

    // People preserved
    expect(data.people).toHaveLength(2);
    const john = data.people.find(p => p.given_name === 'John');
    expect(john.surname).toBe('Smith');
    expect(john.gender).toBe('M');

    // Partner relationship preserved
    expect(data.relationships.filter(r => r.type === 'partner')).toHaveLength(1);

    // Birth event preserved
    const births = data.events.filter(e => e.type === 'birth');
    expect(births).toHaveLength(1);
    expect(births[0].date).toBe('3 SEP 1913');
    expect(births[0].place).toBe('Dublin');
  });
});
