/**
 * utils/dates.js
 * Parse genealogical date strings into unix ms for sorting.
 * Handles GEDCOM-style dates: "1901", "3 SEP 1913", "ABT 1890",
 * "BET 1889 AND 1890", "AFT 1920", "BEF 1850", etc.
 */

const MONTHS = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11
};

/**
 * Parse a date string to unix milliseconds for sorting.
 * Returns null if unparseable.
 */
export function parseSortDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const s = dateStr.trim().toUpperCase();
  if (!s) return null;

  // Strip qualifiers: ABT, CAL, EST, AFT, BEF, CIR, etc.
  const stripped = s
    .replace(/^(ABT|CAL|EST|CIR|CIRCA|ABOUT|AFT|AFTER|BEF|BEFORE)\s+/, '')
    .replace(/^BET\s+/, '')
    .replace(/\s+AND\s+.*$/, '') // BET x AND y → use x
    .trim();

  // Try: D MON YYYY  e.g. "3 SEP 1913"
  const dmy = stripped.match(/^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})$/);
  if (dmy) {
    const month = MONTHS[dmy[2]];
    if (month !== undefined) {
      return Date.UTC(parseInt(dmy[3]), month, parseInt(dmy[1]));
    }
  }

  // Try: MON YYYY  e.g. "SEP 1913"
  const my = stripped.match(/^([A-Z]{3})\s+(\d{4})$/);
  if (my) {
    const month = MONTHS[my[1]];
    if (month !== undefined) {
      return Date.UTC(parseInt(my[2]), month, 1);
    }
  }

  // Try: YYYY  e.g. "1913"
  const y = stripped.match(/^(\d{4})$/);
  if (y) {
    return Date.UTC(parseInt(y[1]), 0, 1);
  }

  // Try: YYYY-MM-DD ISO
  const iso = stripped.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return Date.UTC(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  }

  // Extract first 4-digit year as fallback
  const fallback = stripped.match(/\b(\d{4})\b/);
  if (fallback) {
    return Date.UTC(parseInt(fallback[1]), 0, 1);
  }

  return null;
}

/**
 * Format a unix ms timestamp for display.
 */
export function formatDate(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return d.getUTCFullYear().toString();
}

/**
 * Get just the year from a date string.
 */
export function getYear(dateStr) {
  if (!dateStr) return null;
  const m = dateStr.match(/\b(\d{4})\b/);
  return m ? parseInt(m[1]) : null;
}
