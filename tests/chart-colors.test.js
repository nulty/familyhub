import { describe, it, expect } from 'vitest';
import { migrateColors, LEGACY_COLOR_DEFAULTS, CHART_COLOR_KEYS } from '../src/ui/chart-colors.js';
import { normalizeTheme } from '../src/theme.js';

describe('migrateColors', () => {
  it('rewrites colors equal to the legacy hard defaults to null', () => {
    const { config, changed } = migrateColors({ ...LEGACY_COLOR_DEFAULTS });
    expect(changed).toBe(true);
    for (const key of CHART_COLOR_KEYS) expect(config[key]).toBeNull();
  });

  it('keeps genuine user overrides', () => {
    const stored = { ...LEGACY_COLOR_DEFAULTS, maleColor: '#ff0000' };
    const { config, changed } = migrateColors(stored);
    expect(changed).toBe(true);             // the other four migrated
    expect(config.maleColor).toBe('#ff0000');
    expect(config.femaleColor).toBeNull();
  });

  it('reports no change for already-migrated config', () => {
    const stored = { maleColor: null, femaleColor: null, otherColor: null, bgColor: null, lineColor: null };
    const { config, changed } = migrateColors(stored);
    expect(changed).toBe(false);
    expect(config).toEqual(stored);
  });

  it('reports no change when no color keys are stored at all', () => {
    const { config, changed } = migrateColors({ orientation: 'horizontal', cardWidth: 240 });
    expect(changed).toBe(false);
    expect(config).toEqual({ orientation: 'horizontal', cardWidth: 240 });
  });

  it('does not touch non-color settings', () => {
    const { config } = migrateColors({ ...LEGACY_COLOR_DEFAULTS, ancestryDepth: 5, showLifeYears: true });
    expect(config.ancestryDepth).toBe(5);
    expect(config.showLifeYears).toBe(true);
  });
});

describe('normalizeTheme', () => {
  it('accepts known theme ids', () => {
    expect(normalizeTheme('classic')).toBe('classic');
    expect(normalizeTheme('register')).toBe('register');
  });

  it('falls back to classic for unknown or corrupt values', () => {
    expect(normalizeTheme('neon')).toBe('classic');
    expect(normalizeTheme(null)).toBe('classic');
    expect(normalizeTheme(undefined)).toBe('classic');
    expect(normalizeTheme(42)).toBe('classic');
  });
});
