import { describe, it, expect } from 'vitest';
import { parseSortDate, formatDate, getYear } from './dates.js';

describe('parseSortDate', () => {
  it('parses "D MON YYYY" format', () => {
    expect(parseSortDate('3 SEP 1913')).toBe(Date.UTC(1913, 8, 3));
  });

  it('parses "MON YYYY" format', () => {
    expect(parseSortDate('SEP 1913')).toBe(Date.UTC(1913, 8, 1));
  });

  it('parses "YYYY" format', () => {
    expect(parseSortDate('1913')).toBe(Date.UTC(1913, 0, 1));
  });

  it('parses ISO "YYYY-MM-DD" format', () => {
    expect(parseSortDate('2023-06-15')).toBe(Date.UTC(2023, 5, 15));
  });

  it('strips ABT qualifier', () => {
    expect(parseSortDate('ABT 1890')).toBe(Date.UTC(1890, 0, 1));
  });

  it('strips BET...AND and uses first date', () => {
    expect(parseSortDate('BET 1889 AND 1890')).toBe(Date.UTC(1889, 0, 1));
  });

  it('strips AFT qualifier', () => {
    expect(parseSortDate('AFT 1920')).toBe(Date.UTC(1920, 0, 1));
  });

  it('strips BEF qualifier', () => {
    expect(parseSortDate('BEF 1850')).toBe(Date.UTC(1850, 0, 1));
  });

  it('strips CIRCA qualifier', () => {
    expect(parseSortDate('CIRCA 1900')).toBe(Date.UTC(1900, 0, 1));
  });

  it('is case-insensitive', () => {
    expect(parseSortDate('3 sep 1913')).toBe(Date.UTC(1913, 8, 3));
  });

  it('returns null for null', () => {
    expect(parseSortDate(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseSortDate('')).toBeNull();
  });

  it('returns null for non-string', () => {
    expect(parseSortDate(12345)).toBeNull();
  });

  it('returns null for unparseable string', () => {
    expect(parseSortDate('no date here')).toBeNull();
  });

  it('extracts year as fallback from mixed text', () => {
    expect(parseSortDate('around 1875 maybe')).toBe(Date.UTC(1875, 0, 1));
  });

  it('handles all month abbreviations', () => {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    for (let i = 0; i < months.length; i++) {
      expect(parseSortDate(`${months[i]} 2000`)).toBe(Date.UTC(2000, i, 1));
    }
  });
});

describe('formatDate', () => {
  it('returns year string from unix ms', () => {
    expect(formatDate(Date.UTC(1913, 0, 1))).toBe('1913');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for 0', () => {
    expect(formatDate(0)).toBe('');
  });
});

describe('getYear', () => {
  it('extracts year from date string', () => {
    expect(getYear('3 SEP 1913')).toBe(1913);
  });

  it('extracts year from qualified date', () => {
    expect(getYear('ABT 1890')).toBe(1890);
  });

  it('returns null for null', () => {
    expect(getYear(null)).toBeNull();
  });

  it('returns null for string without year', () => {
    expect(getYear('no year')).toBeNull();
  });
});
