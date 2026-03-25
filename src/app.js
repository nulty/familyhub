/**
 * app.js — Application bootstrap
 */

import { initDB, getStats, bulk, resetDatabase } from './db/db.js';
import { on, emit, state, PERSON_SELECTED, PERSON_DESELECTED, DATA_CHANGED, DB_POPULATED } from './state.js';
import { initTree, refreshTree, focusPerson } from './ui/tree.js';
import { renderPanel, clearPanel } from './ui/panel.js';
import { openPersonForm } from './forms/person-form.js';
import { triggerImport, triggerExport } from './gedcom/gedcom.js';
import { initSearch } from './ui/search.js';
import { showToast } from './ui/toast.js';
import { getConfig, setConfig } from './config.js';
import { openTreeConfig, applyTreeColors, applyCardDisplay, getTreeConfig } from './ui/tree-config.js';
import { openPlacesPage } from './ui/places-page.js';
import { openSourcesPage } from './ui/sources-page.js';
import { mount } from 'svelte';
import Toast from './lib/shared/Toast.svelte';

// Mount Svelte toast component (replaces vanilla #toast-root)
const toastRoot = document.getElementById('toast-root');
toastRoot.innerHTML = '';
mount(Toast, { target: toastRoot });

const mainEl = document.getElementById('main');
const emptyEl = document.getElementById('empty-state');
const chartEl = document.getElementById('chart-container');

let hasData = false;

// Start DB init immediately so the ready promise exists for all callers
initDB();

// Wire buttons and events immediately — don't wait for DB
wireButtons();
wireEvents();
initSearch();

async function boot() {
  const stats = await getStats(); // waits for DB ready internally
  hasData = stats.people > 0;

  if (hasData) {
    showFullUI();
    const rootId = getConfig('rootPerson') || getConfig('lastFocusedPerson');
    await initTree(rootId);
    const treeCfg = getTreeConfig();
    applyTreeColors(treeCfg);
    applyCardDisplay(treeCfg);
  } else {
    showEmptyState();
  }
}

function showEmptyState() {
  emptyEl.classList.remove('hidden');
  chartEl.classList.add('hidden');
}

function showFullUI() {
  emptyEl.classList.add('hidden');
  chartEl.classList.remove('hidden');
}

function wireButtons() {
  document.getElementById('btn-sources').onclick = () => openSourcesPage();
  document.getElementById('btn-places').onclick = () => openPlacesPage();
  document.getElementById('btn-settings').onclick = () => openTreeConfig();
  document.getElementById('btn-add-person').onclick = () => openPersonForm();
  document.getElementById('empty-add-person').onclick = () => openPersonForm();
  document.getElementById('btn-import').onclick = () => triggerImport();
  document.getElementById('empty-import').onclick = () => triggerImport();
  document.getElementById('btn-export').onclick = () => triggerExport();
  document.getElementById('btn-download-db').onclick = async () => {
    try {
      const bytes = await bulk.exportDatabase();
      const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'familytree.db';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Database downloaded');
    } catch (err) {
      showToast('Download failed: ' + err.message);
    }
  };
}

function wireEvents() {
  on(PERSON_SELECTED, (id) => {
    state.selectedPersonId = id;
    setConfig('lastFocusedPerson', id);
    mainEl.classList.add('has-panel');
    renderPanel(id);
  });

  on(PERSON_DESELECTED, () => {
    state.selectedPersonId = null;
    mainEl.classList.remove('has-panel');
    clearPanel();
  });

  on(DATA_CHANGED, async () => {
    const stats = await getStats();
    if (stats.people > 0 && !hasData) {
      hasData = true;
      emit(DB_POPULATED);
    }
    if (stats.people === 0) {
      hasData = false;
      emit(PERSON_DESELECTED);
      showEmptyState();
      return;
    }
    await refreshTree();
    if (state.selectedPersonId) {
      renderPanel(state.selectedPersonId);
    }
  });

  on(DB_POPULATED, async () => {
    showFullUI();
    await initTree();
  });
}

boot().catch(err => console.error('[app] Boot failed:', err));
