/**
 * state.js — Simple event bus + shared state
 */

const listeners = {};

export function on(event, fn) {
  if (!listeners[event]) listeners[event] = [];
  listeners[event].push(fn);
  return () => {
    listeners[event] = listeners[event].filter(f => f !== fn);
  };
}

export function emit(event, payload) {
  for (const fn of listeners[event] || []) {
    try { fn(payload); } catch (e) { console.error(`[state] ${event} handler error:`, e); }
  }
}

export const PERSON_SELECTED = 'PERSON_SELECTED';
export const PERSON_DESELECTED = 'PERSON_DESELECTED';
export const DATA_CHANGED = 'DATA_CHANGED';
export const DB_POPULATED = 'DB_POPULATED';
export const PICK_LOCATION = 'PICK_LOCATION';
export const SHOW_ON_MAP = 'SHOW_ON_MAP';
export const COLLAB_MODE_CHANGED = 'COLLAB_MODE_CHANGED';
export const COLLAB_SYNC_STATUS = 'COLLAB_SYNC_STATUS';

export const state = {
  selectedPersonId: null,
};

import { writable, derived } from 'svelte/store';

// currentRole values:
//   'local'                       → local mode, full rights
//   'owner' | 'editor' | 'viewer' → collaborative tree role
//   null                          → role not yet determined → least privilege (fail safe)
// null deliberately grants nothing: in collab mode a non-owner whose role
// hasn't loaded must NOT briefly see owner/editor controls. Local mode sets
// 'local' explicitly at boot.
export const currentRole = writable(null);
export function setCurrentRole(role) { currentRole.set(role); }

export const canWrite = derived(currentRole, (r) => r === 'local' || r === 'owner' || r === 'editor');
export const canManage = derived(currentRole, (r) => r === 'local' || r === 'owner');
