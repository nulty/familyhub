/**
 * config.js — Persistent UI preferences via localStorage
 */

const PREFIX = 'familyhub:';

export function getConfig(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw !== null ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function setConfig(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

// ─── Collab state ────────────────────────────────────────────────────────────

export function getCollabState() {
  return getConfig('collab', null);
}

export function setCollabState(state) {
  setConfig('collab', state);
}

export function clearCollabState() {
  try {
    localStorage.removeItem(PREFIX + 'collab');
  } catch {}
}

export function getMode() {
  const collab = getCollabState();
  return collab?.mode || 'local';
}
