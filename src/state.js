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

export const state = {
  selectedPersonId: null,
};
