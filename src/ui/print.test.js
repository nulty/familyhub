import { describe, it, expect } from 'vitest';
import { computePrintLayout, PAGE_MARGIN_MM } from './print.js';

const PX_PER_MM = 96 / 25.4;
const printableW = (l) => (l.pageWidthMm - 2 * PAGE_MARGIN_MM) * PX_PER_MM;
const printableH = (l) => (l.pageHeightMm - 2 * PAGE_MARGIN_MM) * PX_PER_MM;

describe('computePrintLayout — auto (actual size)', () => {
  it('keeps the tree at 100% and sizes the page to it plus margins', () => {
    const layout = computePrintLayout({ width: 5000, height: 2000 });
    expect(layout.k).toBe(1);
    expect(layout.pageWidthMm).toBe(Math.ceil(5000 / PX_PER_MM) + 2 * PAGE_MARGIN_MM);
    expect(layout.pageHeightMm).toBe(Math.ceil(2000 / PX_PER_MM) + 2 * PAGE_MARGIN_MM);
  });

  it('uses at least an A4 page for small trees, oriented to the tree aspect', () => {
    const wide = computePrintLayout({ width: 400, height: 300 });
    expect([wide.pageWidthMm, wide.pageHeightMm]).toEqual([297, 210]);
    const tall = computePrintLayout({ width: 300, height: 400 });
    expect([tall.pageWidthMm, tall.pageHeightMm]).toEqual([210, 297]);
  });
});

describe('computePrintLayout — fixed paper', () => {
  it('uses the requested paper size, oriented to the tree aspect', () => {
    const a4 = computePrintLayout({ width: 5000, height: 2000 }, 'a4');
    expect([a4.pageWidthMm, a4.pageHeightMm]).toEqual([297, 210]);
    const a2tall = computePrintLayout({ width: 2000, height: 5000 }, 'a2');
    expect([a2tall.pageWidthMm, a2tall.pageHeightMm]).toEqual([420, 594]);
  });

  it('scales the tree down so it fits the printable area', () => {
    for (const paper of ['a4', 'a3', 'a2']) {
      const layout = computePrintLayout({ width: 5000, height: 4800 }, paper);
      expect(layout.k).toBeLessThan(1);
      expect(5000 * layout.k).toBeLessThanOrEqual(printableW(layout) + 1e-6);
      expect(4800 * layout.k).toBeLessThanOrEqual(printableH(layout) + 1e-6);
    }
  });

  it('larger paper means a larger tree scale', () => {
    const ink = { width: 6000, height: 4000 };
    const k4 = computePrintLayout(ink, 'a4').k;
    const k3 = computePrintLayout(ink, 'a3').k;
    const k2 = computePrintLayout(ink, 'a2').k;
    expect(k3).toBeGreaterThan(k4);
    expect(k2).toBeGreaterThan(k3);
  });

  it('never scales up a small tree', () => {
    expect(computePrintLayout({ width: 400, height: 300 }, 'a2').k).toBe(1);
  });

  it('falls back to auto for unknown paper values', () => {
    const layout = computePrintLayout({ width: 5000, height: 2000 }, 'letter');
    expect(layout.k).toBe(1);
    expect(layout.pageWidthMm).toBe(Math.ceil(5000 / PX_PER_MM) + 2 * PAGE_MARGIN_MM);
  });
});
