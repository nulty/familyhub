import { describe, it, expect } from 'vitest';
import { ulid } from './ulid.js';

describe('ulid', () => {
  it('returns a 26-character string', () => {
    expect(ulid()).toHaveLength(26);
  });

  it('uses only Crockford base32 characters', () => {
    const id = ulid();
    expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]+$/);
  });

  it('generates unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => ulid()));
    expect(ids.size).toBe(100);
  });

  it('encodes seed time of 0 with leading zeros', () => {
    const id = ulid(0);
    expect(id.slice(0, 10)).toBe('0000000000');
  });

  it('is sortable by time — earlier seed sorts first', () => {
    const earlier = ulid(1000);
    const later = ulid(2000);
    expect(earlier.slice(0, 10) < later.slice(0, 10)).toBe(true);
  });
});
