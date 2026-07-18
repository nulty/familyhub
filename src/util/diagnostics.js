/**
 * diagnostics.js
 * Collects app/browser context to attach to a feedback report.
 *
 * PRIVACY: this must never include family-tree data — no names, dates, places,
 * record counts, or anything derived from the user's database. Everything here
 * is app or browser metadata that the user is shown before submitting.
 * tests/diagnostics.test.js enforces the allowed key set.
 */
import { APP_VERSION } from '../version.js';
import { migrations } from '../db/migrations.js';
import { getMode } from '../config.js';

/** The schema version this build ships, i.e. the highest defined migration. */
function schemaVersion() {
  return migrations.reduce((max, m) => Math.max(max, m.version), 0);
}

export function collectDiagnostics() {
  return {
    appVersion: APP_VERSION,
    schemaVersion: schemaVersion(),
    mode: getMode(),
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

/** Human-readable rendering for the "what gets sent" disclosure in the form. */
export function formatDiagnostics(d) {
  return Object.entries(d).map(([k, v]) => `${k}: ${v}`).join('\n');
}
