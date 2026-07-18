/**
 * The privacy guarantee in the feedback spec is that no family-tree data ever
 * leaves the device in a report. These tests pin the exact payload shape so a
 * future addition to collectDiagnostics() cannot quietly widen it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/version.js', () => ({ APP_VERSION: '9.9.9', REPO_URL: 'https://example.test' }));
vi.mock('../src/config.js', () => ({ getMode: () => 'local' }));
vi.mock('../src/db/migrations.js', () => ({
  migrations: [{ version: 7 }, { version: 8 }],
}));

const { collectDiagnostics, formatDiagnostics } = await import('../src/util/diagnostics.js');

const ALLOWED_KEYS = [
  'appVersion', 'schemaVersion', 'mode', 'online', 'userAgent', 'language', 'viewport',
];

describe('collectDiagnostics', () => {
  beforeEach(() => {
    // navigator is a getter-only global — assigning to it directly throws.
    vi.stubGlobal('navigator', { onLine: true, userAgent: 'TestAgent/1.0', language: 'en-IE' });
    vi.stubGlobal('window', { innerWidth: 1440, innerHeight: 900 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('returns exactly the allowed keys and nothing else', () => {
    expect(Object.keys(collectDiagnostics()).sort()).toEqual([...ALLOWED_KEYS].sort());
  });

  it('reports the app version from version.js', () => {
    expect(collectDiagnostics().appVersion).toBe('9.9.9');
  });

  it('reports the highest defined migration as the schema version', () => {
    expect(collectDiagnostics().schemaVersion).toBe(8);
  });

  it('captures mode, connectivity, and viewport', () => {
    const d = collectDiagnostics();
    expect(d.mode).toBe('local');
    expect(d.online).toBe(true);
    expect(d.viewport).toBe('1440x900');
  });

  // The load-bearing privacy test: genealogy terms must never appear.
  it('contains no family-tree data', () => {
    const serialized = JSON.stringify(collectDiagnostics()).toLowerCase();
    for (const term of [
      'person', 'people', 'surname', 'given_name', 'birth', 'death',
      'place', 'event', 'source', 'citation', 'tree_id', 'relationship',
    ]) {
      expect(serialized).not.toContain(term);
    }
  });

  it('formats as readable key/value lines', () => {
    const text = formatDiagnostics(collectDiagnostics());
    expect(text).toContain('appVersion: 9.9.9');
    expect(text.split('\n')).toHaveLength(ALLOWED_KEYS.length);
  });
});
