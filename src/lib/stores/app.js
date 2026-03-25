/**
 * Svelte stores — bidirectional bridge to state.js event bus during migration.
 * Once all consumers are Svelte components, state.js and the bridge can be removed.
 */
import { writable } from 'svelte/store';
import { on, emit, PERSON_SELECTED, PERSON_DESELECTED, DATA_CHANGED } from '../../state.js';

// --- Selected person ---

export const selectedPersonId = writable(null);

// Bridge: event bus → store
on(PERSON_SELECTED, (id) => selectedPersonId.set(id));
on(PERSON_DESELECTED, () => selectedPersonId.set(null));

// Bridge: store → event bus (guard against re-entrant loops)
let _bridging = false;
selectedPersonId.subscribe((id) => {
  if (_bridging) return;
  _bridging = true;
  if (id) emit(PERSON_SELECTED, id);
  else emit(PERSON_DESELECTED);
  _bridging = false;
});

// --- Data version (incremented on every DATA_CHANGED) ---

export const dataVersion = writable(0);

on(DATA_CHANGED, () => dataVersion.update((v) => v + 1));

/** Call after any CRUD operation instead of emit(DATA_CHANGED) */
export function notifyDataChanged() {
  emit(DATA_CHANGED);
}

// --- Modal stack (declarative modal management) ---

export const modalStack = writable([]);

/** Push a modal onto the stack. Returns a close function. */
export function openModal(component, props = {}) {
  const entry = { component, props };
  modalStack.update((stack) => [...stack, entry]);
  return () => modalStack.update((stack) => stack.filter((e) => e !== entry));
}
