<script>
  import { places, events, placeTypes } from '../../db/db.js';
  import { emit, PERSON_SELECTED, DATA_CHANGED } from '../../state.js';
  import { showToast, updateToast, dismissToast } from '../shared/toast-store.js';
  import { batchGeocode, normalizeResult } from '../../util/geocode.js';
  import { GeocodeQueue } from '../../util/geocode-queue.js';
  import { decomposeAddress } from '../../util/decompose.js';
  import { ulid } from '../../util/ulid.js';
  import { getTreeId } from '../../config.js';
  import { openPlaceForm } from '../shared/open.js';
  import { openOrganizeWizard } from '../../ui/places-organize.js';
  import { focusPerson } from '../../ui/tree.js';
  import Modal from '../forms/Modal.svelte';
  import { showConfirm } from '../shared/confirm.js';
  import GeocodeReview from './GeocodeReview.svelte';
  import PlaceTypeSettings from './PlaceTypeSettings.svelte';
  import GeocodeBatchPicker from './GeocodeBatchPicker.svelte';
  import MergePlacesPicker from './MergePlacesPicker.svelte';
  import PlacesHelp from './PlacesHelp.svelte';
  import ClearableInput from '../shared/ClearableInput.svelte';

  let { onclose, openReview = false } = $props();

  let allPlaces = $state([]);
  let byParent = $state({});
  let expandedEvents = $state({});
  let collapsed = $state({});
  let geocoding = $state(false);
  let abortController = null;
  let geocodeQueue = $state(null);
  let queueCounts = $state({ pending: 0, ready: 0, correction: 0 });
  // Which tool owns the main pane. 'tree' = the place list (home).
  let activeView = $state('tree');      // 'tree'|'geocode'|'review'|'merge'|'manual'|'types'|'help'
  let openMenu = $state(null);          // 'tools' | null (mobile dropdown)
  let expandedActionsId = $state(null); // place id whose actions are open
  let manualContainer = $state(null);   // host element for the vanilla wizard
  let manualHandle = $state(null);      // wizard teardown handle

  function setView(v) {
    activeView = activeView === v ? 'tree' : v;
    openMenu = null;
  }

  const VIEW_TITLES = {
    geocode: 'Batch geocode',
    review: 'Review & correct',
    merge: 'Merge duplicates',
    manual: 'Manual structure',
    types: 'Place types',
    help: 'Places guide',
  };
  let activeTitle = $derived(VIEW_TITLES[activeView] || '');

  function refreshQueueCounts() {
    queueCounts = geocodeQueue ? geocodeQueue.countByStatus() : { pending: 0, ready: 0, correction: 0 };
  }

  $effect(() => {
    function onDocClick(e) {
      if (openMenu && !e.target.closest('.toolbar-menu')) openMenu = null;
      if (expandedActionsId && !e.target.closest('.place-tree-item')) expandedActionsId = null;
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  });

  function runFromMenu(action) {
    openMenu = null;
    action?.();
  }

  function toggleActions(placeId) {
    expandedActionsId = expandedActionsId === placeId ? null : placeId;
  }

  function runRowAction(action) {
    expandedActionsId = null;
    action?.();
  }

  $effect(() => {
    if (!geocodeQueue) {
      geocodeQueue = new GeocodeQueue(getTreeId());
      refreshQueueCounts();
      if (openReview && queueCounts.ready + queueCounts.correction > 0) {
        activeView = 'review';
      }
    }
  });

  // Mount / tear down the vanilla Manual-structure wizard as the pane opens/closes.
  $effect(() => {
    const wantManual = activeView === 'manual';
    if (wantManual && manualContainer && !manualHandle) {
      let cancelled = false;
      openOrganizeWizard(() => { activeView = 'tree'; loadData(); }, { container: manualContainer })
        .then((h) => {
          if (cancelled || activeView !== 'manual') h.destroy();
          else manualHandle = h;
        });
      return () => { cancelled = true; };
    }
    if (!wantManual && manualHandle) {
      manualHandle.destroy();
      manualHandle = null;
    }
  });

  // Tool list — rendered identically in the desktop sidebar and the mobile
  // dropdown. `kind: 'view'` items own the main pane (highlighted when active);
  // `kind: 'action'` items fire and return.
  let toolItems = $derived.by(() => {
    const items = [
      { key: 'geocode', label: geocoding ? 'Stop geocoding' : 'Geocode', hint: 'Fetch matches for places without coordinates', kind: 'view', view: 'geocode', badge: queueCounts.pending || null, run: handleGeocode },
    ];
    if (queueCounts.ready > 0) items.push({ key: 'review', label: 'Review', hint: 'Check candidate matches', kind: 'view', view: 'review', badge: queueCounts.ready, run: () => setView('review') });
    if (queueCounts.correction > 0) items.push({ key: 'correct', label: 'Correct', hint: 'Fix places with no match', kind: 'view', view: 'review', badge: queueCounts.correction, warn: true, run: () => setView('review') });
    items.push(
      { key: 'merge', label: 'Merge duplicates', hint: 'Combine duplicate place records', kind: 'view', view: 'merge', run: () => setView('merge') },
      { key: 'manual', label: 'Manual structure', hint: 'For historic / non-standard addresses', kind: 'view', view: 'manual', run: () => setView('manual') },
      { key: 'types', label: 'Place types', hint: 'Manage place type labels', kind: 'view', view: 'types', run: () => setView('types') },
      { key: 'help', label: 'Help', hint: 'Step-by-step guide for the places workflow', kind: 'view', view: 'help', run: () => setView('help') },
      { key: 'export', label: 'Export places JSON', hint: 'Download places as JSON', kind: 'action', run: handleExport },
      { key: 'import', label: 'Import places JSON', hint: 'Restore from a JSON file', kind: 'action', run: handleImport },
    );
    if (queueCounts.pending + queueCounts.ready + queueCounts.correction > 0)
      items.push({ key: 'reset', label: 'Reset queue', hint: 'Discard all queued geocode work', kind: 'action', subtle: true, run: resetQueue });
    return items;
  });
  let navViews = $derived(toolItems.filter((i) => i.kind === 'view'));
  let navActions = $derived(toolItems.filter((i) => i.kind === 'action'));

  function isViewActive(item) {
    return item.kind === 'view' && item.view === activeView;
  }

  const decompositionHandlers = {
    findPlaceByNameTypeParent: (name, type, parentId) => places.findByNameTypeParent(name, type, parentId),
    createPlace: (data) => places.create(data),
    ensurePlaceType: (key) => placeTypes.ensure(key),
    updatePlace: (id, fields) => places.update(id, fields),
    updateEvent: (id, fields) => events.update(id, fields),
    deletePlace: (id) => places.delete(id),
  };

  let filterText = $state('');
  let matchingIds = $derived.by(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return null;
    const directMatches = new Set(allPlaces.filter(p => p.name.toLowerCase().includes(q)).map(p => p.id));
    const allIds = new Set(directMatches);
    const placeMap = new Map(allPlaces.map(p => [p.id, p]));
    for (const id of directMatches) {
      let p = placeMap.get(id);
      while (p?.parent_id) {
        allIds.add(p.parent_id);
        p = placeMap.get(p.parent_id);
      }
    }
    return allIds;
  });

  $effect(() => { loadData(); });

  async function loadData() {
    allPlaces = await places.tree();
    const map = {};
    for (const p of allPlaces) {
      const key = p.parent_id || '__root__';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    byParent = map;
  }

  function getChildren(parentKey) {
    const children = byParent[parentKey] || [];
    if (!matchingIds) return children;
    return children.filter(p => matchingIds.has(p.id));
  }

  function hasChildren(placeId) {
    return (byParent[placeId]?.length || 0) > 0;
  }

  function toggleCollapse(placeId) {
    collapsed = { ...collapsed, [placeId]: !collapsed[placeId] };
  }

  async function toggleEvents(placeId) {
    if (expandedEvents[placeId]) {
      expandedEvents = { ...expandedEvents, [placeId]: null };
    } else {
      const list = await places.events(placeId);
      expandedEvents = { ...expandedEvents, [placeId]: list };
    }
  }

  function navigateToPerson(personId) {
    focusPerson(personId);
    emit(PERSON_SELECTED, personId);
    onclose?.();
  }

  async function deletePlace(place) {
    const linked = await places.events(place.id);
    const eventLine = linked.length > 0
      ? `${linked.length} event${linked.length === 1 ? '' : 's'} reference this place — they will keep the place name as text.\n`
      : '';
    if (!await showConfirm({ title: `Delete "${place.name}"?`, message: `${eventLine}Children will become root places.`, confirm: 'Delete', danger: true })) return;
    await places.delete(place.id);
    geocodeQueue?.removeItem(place.id);
    refreshQueueCounts();
    emit(DATA_CHANGED);
    showToast(`Deleted ${place.name}`);
    await loadData();
  }

  async function handleExport() {
    const all = await places.list();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'places.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Places exported');
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) { showToast('Invalid format — expected an array'); return; }
        const idMap = {};
        const sorted = [];
        const remaining = [...data];
        while (remaining.length > 0) {
          const batch = remaining.filter(p => !p.parent_id || idMap[p.parent_id]);
          if (batch.length === 0) { sorted.push(...remaining); break; }
          sorted.push(...batch);
          for (const p of batch) remaining.splice(remaining.indexOf(p), 1);
        }
        let count = 0;
        let skipped = 0;
        for (const p of sorted) {
          try {
            const newParentId = p.parent_id ? (idMap[p.parent_id] || null) : null;
            const match = await places.findByNameTypeParent(p.name, p.type || '', newParentId);
            if (match) { idMap[p.id] = match.id; skipped++; continue; }
            const created = await places.create({ name: p.name, type: p.type || '', parent_id: newParentId, notes: p.notes || '' });
            idMap[p.id] = created.id;
            count++;
          } catch { /* skip errors */ }
        }
        emit(DATA_CHANGED);
        showToast(`Imported ${count} places${skipped ? `, ${skipped} already existed` : ''}`);
        await loadData();
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    };
    input.click();
  }

  // A place is blocked from fetching only if it's queued PAST the pending stage
  // (already has candidates awaiting review, or sits in correction).
  function isQueueBlocked(id) {
    const status = geocodeQueue?.getStatus(id);
    return status != null && status !== 'pending';
  }

  function handleGeocode() {
    openMenu = null;
    if (geocoding) {
      abortController?.abort();
      return;
    }
    setView('geocode');
  }

  async function startBatch({ selectedIds, bias }) {
    const selectedSet = new Set(selectedIds);
    geocoding = true;
    abortController = new AbortController();
    const toastId = showToast('Starting geocode…', 0);

    try {
      const allPlacesList = await places.list();
      const targetPlaces = allPlacesList.filter((p) => selectedSet.has(p.id));

      // Inject bias into query by shallow-copying the place objects with modified .name.
      // We don't mutate the DB — we mutate a shallow copy.
      const biased = bias ? targetPlaces.map((p) => {
        const contains = p.name.toLowerCase().includes(bias.toLowerCase());
        return contains ? p : { ...p, name: `${p.name}, ${bias}` };
      }) : targetPlaces;

      // Funnel routing: each place goes to exactly one of
      //   1 match  → auto-apply (organized)
      //   2+       → review pile
      //   0        → correction pile
      let autoApplied = 0;
      let toReview = 0;
      let toCorrect = 0;

      const result = await batchGeocode({
        places: biased,
        hasQueueEntry: isQueueBlocked,
        onResult: async (place, rawResults) => {
          // `place` here is the biased version; recover the original DB record
          const original = allPlacesList.find((p) => p.id === place.id);
          const results = rawResults.map(normalizeResult);
          if (results.length === 1) {
            const evts = await places.events(place.id);
            await decomposeAddress({
              nominatimResult: results[0],
              originalPlaceId: place.id,
              eventIds: evts.map((e) => e.id),
              handlers: decompositionHandlers,
              generateId: ulid,
            });
            geocodeQueue.removeItem(place.id);
            autoApplied++;
          } else {
            const status = results.length > 0 ? 'ready' : 'correction';
            if (status === 'ready') toReview++;
            else toCorrect++;
            geocodeQueue.upsertItem({
              place_id: place.id,
              place_name: original?.name ?? place.name,
              query: place.name,  // the biased query
              status,
              results,
            });
          }
          refreshQueueCounts();
        },
        onProgress: (current, total) => {
          updateToast(toastId, `Geocoding ${current}/${total}…`);
        },
        signal: abortController.signal,
      });

      dismissToast(toastId);

      if (result.total === 0) {
        showToast('No places to geocode');
      } else {
        const parts = [];
        if (autoApplied > 0) parts.push(`${autoApplied} matched automatically`);
        if (toReview > 0) parts.push(`${toReview} need review`);
        if (toCorrect > 0) parts.push(`${toCorrect} need correction`);
        showToast(parts.join(', ') || 'Geocoding finished');
      }

      await loadData();
    } catch (err) {
      dismissToast(toastId);
      if (err.name !== 'AbortError') {
        showToast('Geocoding error: ' + err.message);
      }
    } finally {
      geocoding = false;
      abortController = null;
    }
  }

  function resetQueue() {
    if (!geocodeQueue) return;
    geocodeQueue.clear();
    refreshQueueCounts();
    showToast('Queue cleared');
  }

  function formatName(ev) {
    if (ev.person_id) return [ev.given_name, ev.surname].filter(Boolean).join(' ') || 'Unnamed';
    if (ev.participants?.length) return ev.participants.map(p => [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed').join(' & ');
    return 'Unnamed';
  }
</script>

<Modal title="Places" xwide={true} onclose={onclose}>
  <div class="places-shell">
    <!-- Desktop sidebar — collapses to the mobile toolbar dropdown < 768px -->
    <aside class="places-sidebar">
      <button class="btn btn-sm btn-primary sidebar-add" onclick={() => openPlaceForm(null, () => loadData())}>
        + Add place
      </button>
      <nav class="sidebar-nav" aria-label="Places tools">
        <button
          class="sidebar-item"
          class:active={activeView === 'tree'}
          aria-current={activeView === 'tree' ? 'page' : undefined}
          onclick={() => setView('tree')}
        >
          <span class="sidebar-label">All places</span>
        </button>
        <div class="sidebar-divider"></div>
        {#each navViews as item (item.key)}
          <button
            class="sidebar-item"
            class:active={isViewActive(item)}
            class:warn={item.warn}
            aria-current={isViewActive(item) ? 'page' : undefined}
            onclick={item.run}
          >
            <span class="sidebar-label">{item.label}</span>
            {#if item.badge}<span class="sidebar-badge" class:warn={item.warn}>{item.badge}</span>{/if}
          </button>
        {/each}
        <div class="sidebar-divider"></div>
        {#each navActions as item (item.key)}
          <button class="sidebar-item" class:subtle={item.subtle} onclick={item.run}>
            <span class="sidebar-label">{item.label}</span>
          </button>
        {/each}
      </nav>
    </aside>

    <!-- Main pane -->
    <section class="places-main">
      <!-- Mobile toolbar (sidebar hidden < 768px): Add place + Tools dropdown -->
      <div class="places-mobile-toolbar">
        <button class="btn btn-sm btn-primary" onclick={() => openPlaceForm(null, () => loadData())}>
          + Add place
        </button>
        <div class="toolbar-menu toolbar-right" class:open={openMenu === 'tools'}>
          <button
            class="btn btn-sm menu-trigger"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'tools'}
            onclick={(e) => { e.stopPropagation(); openMenu = openMenu === 'tools' ? null : 'tools'; }}
          >
            Tools <span class="caret" aria-hidden="true">▾</span>
          </button>
          {#if openMenu === 'tools'}
            <div class="menu-panel menu-panel-right" role="menu">
              {#each toolItems as item (item.key)}
                <button class="menu-item" class:subtle={item.subtle} role="menuitem" onclick={() => runFromMenu(item.run)}>
                  <span class="menu-item-label">{item.label}{#if item.badge} ({item.badge}){/if}</span>
                  <span class="menu-item-hint">{item.hint}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>

      {#if activeView !== 'tree'}
        <div class="pane-header">
          <button class="btn-link pane-back" onclick={() => setView('tree')}>← Places</button>
          <h3 class="pane-title">{activeTitle}</h3>
        </div>
      {/if}

      {#if activeView === 'geocode'}
        <GeocodeBatchPicker
          embedded
          treeId={getTreeId()}
          {isQueueBlocked}
          onstart={startBatch}
          onclose={() => setView('tree')}
        />
      {:else if activeView === 'review'}
        {#if geocodeQueue}
          <GeocodeReview
            queue={geocodeQueue}
            onUpdate={() => { refreshQueueCounts(); loadData(); }}
            onClose={() => setView('tree')}
          />
        {/if}
      {:else if activeView === 'merge'}
        <MergePlacesPicker
          embedded
          oncomplete={() => { refreshQueueCounts(); loadData(); }}
          onclose={() => setView('tree')}
        />
      {:else if activeView === 'types'}
        <PlaceTypeSettings onClose={() => setView('tree')} />
      {:else if activeView === 'help'}
        <PlacesHelp embedded onclose={() => setView('tree')} />
      {:else if activeView === 'manual'}
        <div class="manual-mount" bind:this={manualContainer}></div>
      {:else}
    <div class="form-group" style="margin-bottom:12px">
      <ClearableInput placeholder="Filter places…" bind:value={filterText} />
    </div>

    {#if allPlaces.length === 0}
      <p class="section-empty">No places yet. Add one or import a GEDCOM file.</p>
    {:else}
      {#snippet placeTree(parentKey)}
        <ul class="place-tree">
          {#each getChildren(parentKey) as place}
            <li class="place-tree-item">
              <div class="place-tree-row">
                <div class="place-row-main">
                  {#if hasChildren(place.id)}
                    <span class="place-toggle" onclick={() => toggleCollapse(place.id)}>
                      {collapsed[place.id] ? '\u25B6' : '\u25BC'}
                    </span>
                  {:else}
                    <span class="place-toggle-spacer"></span>
                  {/if}
                  <span class="place-tree-name">{place.name}</span>
                  {#if place.type}
                    <span class="place-type-badge">{place.type}</span>
                  {:else}
                    <span class="place-needs-badge" title="Not searchable until geocoded or given a type">unorganized</span>
                  {/if}
                  {#if place.latitude != null}<span class="place-geocoded" title="Geocoded">&#x1F4CD;</span>{/if}
                </div>
                <button
                  class="row-kebab"
                  class:open={expandedActionsId === place.id}
                  aria-label="Actions"
                  aria-expanded={expandedActionsId === place.id}
                  onclick={(e) => { e.stopPropagation(); toggleActions(place.id); }}
                >&#x22EF;</button>
              </div>
              {#if expandedActionsId === place.id}
                <div class="row-actions-panel">
                  <button class="row-action" onclick={() => runRowAction(() => toggleEvents(place.id))}>Events</button>
                  <button class="row-action" onclick={() => runRowAction(() => openPlaceForm(null, () => loadData(), { parent_id: place.id }))}>+ Add child</button>
                  <button class="row-action" onclick={() => runRowAction(() => openPlaceForm(place.id, () => loadData()))}>Edit</button>
                  <button class="row-action danger" onclick={() => runRowAction(() => deletePlace(place))}>Delete</button>
                </div>
              {/if}
              {#if expandedEvents[place.id]}
                <div class="place-events-list">
                  {#if expandedEvents[place.id].length === 0}
                    <div class="section-empty" style="padding:4px 0">No linked events</div>
                  {:else}
                    {#each expandedEvents[place.id] as ev}
                      <div class="place-event-row">
                        <span class="place-event-type">{ev.type}</span>
                        {#if ev.date}<span class="place-event-date">{ev.date}</span>{/if}
                        <a href="#" class="place-event-person" onclick={(e) => { e.preventDefault(); navigateToPerson(ev.person_id || ev.participants?.[0]?.person_id); }}>{formatName(ev)}</a>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
              {#if hasChildren(place.id) && !collapsed[place.id]}
                {@render placeTree(place.id)}
              {/if}
            </li>
          {/each}
        </ul>
      {/snippet}

      {@render placeTree('__root__')}

      <div class="places-legend">
        <span>📍 geocoded</span>
        <span><span class="place-needs-badge">unorganized</span> not searchable until geocoded or given a type</span>
      </div>
        {/if}
      {/if}
    </section>
  </div>
</Modal>

<style>
  /* ── Two-pane shell (desktop) ─────────────────────────────────────────── */
  .places-shell {
    display: flex;
    align-items: flex-start;
    gap: 18px;
  }
  .places-sidebar {
    flex: 0 0 200px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    position: sticky;
    top: 0;
    align-self: flex-start;
    padding-right: 16px;
    border-right: 1px solid var(--border, #eee);
  }
  .sidebar-add {
    width: 100%;
    justify-content: center;
  }
  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-radius: 6px;
    padding: 7px 10px;
    cursor: pointer;
    color: var(--text, #333);
    font-size: 0.88rem;
  }
  .sidebar-item:hover,
  .sidebar-item:focus-visible {
    background: var(--bg-hover, #f3f6fa);
    outline: none;
  }
  .sidebar-item.active {
    background: var(--accent-color, #3498db);
    color: #fff;
    font-weight: 500;
  }
  .sidebar-item.subtle .sidebar-label {
    color: var(--text-muted, #888);
  }
  .sidebar-label {
    flex: 1;
    min-width: 0;
  }
  .sidebar-badge {
    flex-shrink: 0;
    font-size: 0.72rem;
    font-weight: 600;
    min-width: 18px;
    text-align: center;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--bg-hover, #eef2f6);
    color: var(--text-muted, #666);
  }
  .sidebar-badge.warn {
    color: var(--warning-text, #92400e);
    background: var(--warning-bg, #fef3e2);
  }
  .sidebar-item.active .sidebar-badge {
    background: rgba(255, 255, 255, 0.25);
    color: #fff;
  }
  .sidebar-divider {
    height: 1px;
    background: var(--border, #eee);
    margin: 6px 4px;
  }
  .places-main {
    flex: 1 1 auto;
    min-width: 0;
  }

  /* Main-pane header for an active tool view */
  .pane-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border, #eee);
  }
  .pane-back {
    flex-shrink: 0;
  }
  .pane-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin: 0;
  }

  /* Mobile toolbar — hidden on desktop, shown when the sidebar collapses */
  .places-mobile-toolbar {
    display: none;
    gap: 8px;
    margin-bottom: 12px;
    align-items: center;
  }

  @media (max-width: 768px) {
    .places-shell {
      display: block;
    }
    .places-sidebar {
      display: none;
    }
    .places-mobile-toolbar {
      display: flex;
    }
  }

  .toolbar-menu {
    position: relative;
  }
  .toolbar-right {
    margin-left: auto;
  }
  /* Compound selector: must outrank .menu-panel's `left: 0`, which is declared
     later in this block. Right-anchored so the panel stays inside the modal. */
  .menu-panel.menu-panel-right {
    left: auto;
    right: 0;
  }
  .place-needs-badge {
    font-size: 0.7rem;
    padding: 1px 8px;
    border-radius: 10px;
    color: var(--warning-text, #92400e);
    border: 1px solid var(--warning-border, #f5d9a8);
    background: var(--warning-bg, #fef3e2);
    white-space: nowrap;
  }
  .places-legend {
    display: flex;
    gap: 16px;
    align-items: center;
    flex-wrap: wrap;
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--border-color, #eee);
    font-size: 0.75rem;
    color: var(--text-muted, #888);
  }
  .menu-trigger {
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .toolbar-menu.open .menu-trigger {
    background: var(--accent-color, #3498db);
    color: #fff;
    border-color: var(--accent-color, #3498db);
  }
  .caret {
    font-size: 0.7rem;
    opacity: 0.7;
  }
  .menu-panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 50;
    min-width: 240px;
    max-width: 320px;
    background: var(--bg, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
    padding: 4px;
    display: flex;
    flex-direction: column;
  }
  .menu-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: 8px 10px;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    color: var(--text, #333);
    width: 100%;
  }
  .menu-item:hover,
  .menu-item:focus-visible {
    background: var(--bg-hover, #f3f6fa);
    outline: none;
  }
  .menu-item.subtle .menu-item-label {
    color: var(--text-muted, #888);
  }
  .menu-item-label {
    font-size: 0.9rem;
    font-weight: 500;
  }
  .menu-item-hint {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
  }

  .row-kebab {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    width: 28px;
    height: 28px;
    cursor: pointer;
    color: var(--text-muted, #888);
    font-size: 18px;
    line-height: 1;
    flex-shrink: 0;
    user-select: none;
  }
  .row-kebab:hover,
  .row-kebab.open {
    background: var(--bg-hover, #eef2f6);
    color: var(--text, #333);
    border-color: var(--border-color, #ddd);
  }
  .row-actions-panel {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    padding: 6px 10px 8px 32px;
    background: var(--bg-elevated, #fafbfd);
    border-radius: 0 0 4px 4px;
    margin: -2px 0 4px;
  }
  .row-action {
    background: var(--bg, #fff);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text, #333);
    min-height: 32px;
  }
  .row-action:hover,
  .row-action:focus-visible {
    background: var(--bg-hover, #f0f4f8);
    outline: none;
  }
  .row-action.danger {
    color: var(--danger, #c0392b);
    border-color: var(--danger, #c0392b);
  }
  .row-action.danger:hover {
    background: var(--danger, #c0392b);
    color: #fff;
  }
</style>
