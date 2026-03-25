<script>
  import { onMount } from 'svelte';
  import { initDB, getStats, bulk } from '../../db/db.js';
  import { on, emit, state as appState, PERSON_SELECTED, PERSON_DESELECTED, DATA_CHANGED, DB_POPULATED } from '../../state.js';
  import { initTree, refreshTree } from '../../ui/tree.js';
  import { getConfig, setConfig } from '../../config.js';
  import { getTreeConfig, applyTreeColors, applyCardDisplay, openTreeConfig } from '../../ui/tree-config.js';
  import { openPersonForm } from '../../forms/person-form.js';
  import { triggerImport, triggerExport } from '../../gedcom/gedcom.js';
  import { openPlacesPage } from '../../ui/places-page.js';
  import { openSourcesPage } from '../../ui/sources-page.js';
  import { showToast } from '../shared/toast-store.js';
  import Search from './Search.svelte';
  import Panel from './Panel.svelte';
  import Toast from '../shared/Toast.svelte';

  let hasData = $state(false);
  let selectedPersonId = $state(null);
  let dataVersion = $state(0);

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
</script>

<div id="app">
  <header id="header">
    <span class="logo">FamilyHub</span>

    <Search />

    <div class="header-actions">
      <button class="btn" onclick={() => openSourcesPage()}>Sources</button>
      <button class="btn" onclick={() => openPlacesPage()}>Places</button>
      <button class="btn" onclick={() => openTreeConfig()}>Settings</button>
      <button class="btn btn-primary" onclick={() => openPersonForm()}>+ Person</button>
      <button class="btn" onclick={() => triggerImport()}>Import</button>
      <button class="btn" onclick={() => triggerExport()}>Export</button>
      <button class="btn" onclick={downloadDB}>Download DB</button>
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

<div id="modal-root"></div>
<div id="toast-root">
  <Toast />
</div>
