/**
 * panel.js — Bridge: mounts Svelte Panel into #panel-content.
 * Manages mount/unmount lifecycle to match the old renderPanel/clearPanel API.
 */
import { mount, unmount } from 'svelte';
import Panel from '../lib/components/Panel.svelte';
import { on, DATA_CHANGED } from '../state.js';

let component = null;
let currentPersonId = null;

export function renderPanel(personId) {
  const target = document.getElementById('panel-content');
  // Unmount previous if exists
  if (component) {
    unmount(component);
    component = null;
  }
  target.innerHTML = '';
  currentPersonId = personId;

  component = mount(Panel, {
    target,
    props: { personId },
  });
}

export function clearPanel() {
  const target = document.getElementById('panel-content');
  if (component) {
    unmount(component);
    component = null;
  }
  target.innerHTML = '';
  currentPersonId = null;
}

// Re-render panel when data changes (same as old behavior in app.js)
// This is handled by app.js calling renderPanel again, so no extra listener needed here.
