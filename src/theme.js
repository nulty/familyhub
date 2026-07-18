/**
 * theme.js — UI theme selection, persisted via config.js.
 *
 * A theme is one [data-theme] block of semantic token values in styles.css
 * (see docs/theming.md). The pre-paint script in index.html mirrors this
 * module's storage key and default so the theme applies before first paint —
 * keep the two in sync.
 */
import { getConfig, setConfig } from './config.js';

export const THEMES = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'The familiar look — light, blue accent, rounded controls.',
  },
  {
    id: 'register',
    label: 'Register',
    description: 'Ledger-inspired — serif names, tabular dates, oxblood accent.',
  },
];

/** Coerce any stored value to a known theme id. Pure; unit-tested. */
export function normalizeTheme(raw) {
  return THEMES.some((t) => t.id === raw) ? raw : 'classic';
}

export function getTheme() {
  return normalizeTheme(getConfig('theme', 'classic'));
}

export function setTheme(id) {
  const theme = normalizeTheme(id);
  setConfig('theme', theme);
  applyTheme(theme);
}

/** Stamp the current theme on <html>. Called at boot and on change. */
export function applyTheme(id = getTheme()) {
  document.documentElement.dataset.theme = id;
}
