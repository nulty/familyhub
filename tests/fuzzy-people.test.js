import { describe, it, expect } from 'vitest';
import { createPersonSearchIndex, searchPersonIndex } from '../src/util/fuzzy-people.js';

const people = [
  { id: 'P1', given_name: 'John',    surname: 'Smith',     birth_year: '1890' },
  { id: 'P2', given_name: 'Jonathan', surname: 'Smithson',  birth_year: '1910' },
  { id: 'P3', given_name: 'Mary',    surname: 'Smith',     birth_year: '1892' },
  { id: 'P4', given_name: 'Sean',    surname: 'O’Connor', birth_year: '1880' },
  { id: 'P5', given_name: 'Margaret', surname: 'Jones',     birth_year: '1905' },
];

describe('fuzzy-people search', () => {
  it('returns exact full-name match first', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'John Smith');
    expect(results[0].id).toBe('P1');
  });

  it('matches a single-character typo in given name', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'Jon Smith');
    const ids = results.map(r => r.id);
    expect(ids).toContain('P1');
  });

  it('matches transposed letters in surname', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'Smtih');
    const ids = results.map(r => r.id);
    expect(ids).toContain('P1');
    expect(ids).toContain('P3');
  });

  it('matches a partial surname', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'Smith');
    const ids = results.map(r => r.id);
    expect(ids).toContain('P1');
    expect(ids).toContain('P3');
  });

  it('returns no results for unrelated query', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'Zzzzzz Qqqqqq');
    expect(results).toHaveLength(0);
  });

  it('respects the limit argument', () => {
    const fuse = createPersonSearchIndex(people);
    const results = searchPersonIndex(fuse, 'Smith', 1);
    expect(results).toHaveLength(1);
  });

  it('matches a query that concatenates prefixes of given_name and surname', () => {
    const data = [
      { id: 'P1', given_name: 'Thomas', surname: 'Gaffney' },
      { id: 'P2', given_name: 'John',   surname: 'Smith' },
      { id: 'P3', given_name: 'Mary',   surname: 'Jones' },
    ];
    const fuse = createPersonSearchIndex(data);
    expect(searchPersonIndex(fuse, 'tomgaf').map(r => r.id)).toContain('P1');
    expect(searchPersonIndex(fuse, 'johsmi').map(r => r.id)).toContain('P2');
    expect(searchPersonIndex(fuse, 'marjon').map(r => r.id)).toContain('P3');
  });

  it('does not leak the internal full_name field on results', () => {
    const fuse = createPersonSearchIndex(people);
    const [first] = searchPersonIndex(fuse, 'John');
    expect(first).not.toHaveProperty('full_name');
    expect(first).toHaveProperty('given_name');
    expect(first).toHaveProperty('surname');
    expect(first).toHaveProperty('birth_year');
  });
});
