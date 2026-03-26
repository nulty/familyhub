<script>
  import { onMount } from 'svelte';
  import { initDB, getStats, nukeDatabase, bulk } from '../../db/db.js';
  import { on, emit, state as appState, PERSON_SELECTED, PERSON_DESELECTED, DATA_CHANGED, DB_POPULATED } from '../../state.js';
  import { initTree, refreshTree } from '../../ui/tree.js';
  import { getConfig, setConfig } from '../../config.js';
  import { getTreeConfig, applyTreeColors, applyCardDisplay, openTreeConfig } from '../../ui/tree-config.js';
  import { openPersonForm, openPlacesPage, openSourcesPage } from '../shared/open.js';
  import { triggerImport, triggerExport } from '../../gedcom/gedcom.js';
  import { showToast } from '../shared/toast-store.js';
  import { getStack } from '../shared/modal-stack.svelte.js';
  import Search from './Search.svelte';
  import Panel from './Panel.svelte';
  import Toast from '../shared/Toast.svelte';

  let hasData = $state(false);
  let selectedPersonId = $state(null);
  let dataVersion = $state(0);
  let menuOpen = $state(false);
  let uploadStatus = $state(null);

  const modalStack = getStack;

  onMount(() => {
    initDB();

    on(PERSON_SELECTED, (id) => {
      appState.selectedPersonId = id;
      selectedPersonId = id;
      setConfig('lastFocusedPerson', id);
    });

    on(PERSON_DESELECTED, () => {
      appState.selectedPersonId = null;
      selectedPersonId = null;
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
        return;
      }
      await refreshTree();
      dataVersion++;
    });

    on(DB_POPULATED, async () => {
      await initTree();
    });

    boot();
  });

  async function boot() {
    const stats = await getStats();
    hasData = stats.people > 0;

    if (hasData) {
      const rootId = getConfig('rootPerson') || getConfig('lastFocusedPerson');
      await initTree(rootId);
      const treeCfg = getTreeConfig();
      applyTreeColors(treeCfg);
      applyCardDisplay(treeCfg);
    }
  }

  async function downloadDB() {
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
  }

  function uploadDB() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm(`Replace the current database with "${file.name}"? This cannot be undone.`)) return;
      try {
        uploadStatus = 'Reading file\u2026';
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        uploadStatus = 'Restoring database\u2026';
        await bulk.importDatabase(bytes);
        emit(PERSON_DESELECTED);
        emit(DATA_CHANGED);
        showToast('Database restored from ' + file.name);
      } catch (err) {
        showToast('Upload failed: ' + err.message);
      } finally {
        uploadStatus = null;
      }
    };
    input.click();
  }

  function menuAction(fn) {
    menuOpen = false;
    fn();
  }

  async function nukeDB() {
    if (!confirm('Delete ALL data? This cannot be undone.')) return;
    try {
      uploadStatus = 'Deleting all data\u2026';
      await nukeDatabase();
      emit(PERSON_DESELECTED);
      emit(DATA_CHANGED);
      showToast('Database wiped');
    } finally {
      uploadStatus = null;
    }
  }

  function handleMenuKeydown(e) {
    if (e.key === 'Escape') menuOpen = false;
  }
</script>

<div id="app">
  <header id="header">
    <span class="logo">FamilyHub</span>

    <Search />

    <div class="header-actions">
      <button class="btn btn-primary" onclick={() => openPersonForm()}>+ Person</button>
      <div class="menu-wrapper">
        <button class="btn menu-toggle" onclick={() => menuOpen = !menuOpen} aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="4" x2="15" y2="4"/><line x1="3" y1="9" x2="15" y2="9"/><line x1="3" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        {#if menuOpen}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="menu-backdrop" onclick={() => menuOpen = false} onkeydown={handleMenuKeydown}></div>
          <div class="menu-dropdown">
            <button class="menu-item" onclick={() => menuAction(openSourcesPage)}>Sources</button>
            <button class="menu-item" onclick={() => menuAction(openPlacesPage)}>Places</button>
            <button class="menu-item" onclick={() => menuAction(openTreeConfig)}>Settings</button>
            <hr class="menu-divider" />
            <button class="menu-item" onclick={() => menuAction(triggerImport)}>Import GEDCOM</button>
            <button class="menu-item" onclick={() => menuAction(triggerExport)}>Export GEDCOM</button>
            <hr class="menu-divider" />
            <button class="menu-item" onclick={() => menuAction(downloadDB)}>Download DB</button>
            <button class="menu-item" onclick={() => menuAction(uploadDB)}>Upload DB</button>
            <hr class="menu-divider" />
            <button class="menu-item menu-item-danger" onclick={() => menuAction(nukeDB)}>Delete All Data</button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div id="main" class:has-panel={selectedPersonId}>
    {#if hasData}
      <div id="chart-container">
        <div id="FamilyChart" class="f3"></div>
        <div id="tree-config"></div>
      </div>
    {:else}
      <div id="empty-state">
        <h2>No people yet</h2>
        <p>Create your first person or import a GEDCOM file to get started.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" onclick={() => openPersonForm()}>+ Add First Person</button>
          <button class="btn" onclick={() => triggerImport()}>Import GEDCOM</button>
        </div>
      </div>
    {/if}

    <aside id="panel">
      <div id="panel-content">
        {#if selectedPersonId}
          {#key `${selectedPersonId}-${dataVersion}`}
            <Panel personId={selectedPersonId} />
          {/key}
        {/if}
      </div>
    </aside>
  </div>
</div>

<div id="modal-root">
  {#each modalStack() as modal (modal.id)}
    <modal.component {...modal.props} />
  {/each}
</div>

{#if uploadStatus}
  <div class="upload-overlay">
    <div class="upload-card">
      <div class="upload-progress-bar"><div class="upload-progress-fill"></div></div>
      <p class="upload-status">{uploadStatus}</p>
    </div>
  </div>
{/if}

<div id="toast-root">
  <Toast />
</div>
