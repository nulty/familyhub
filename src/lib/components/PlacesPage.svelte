<script>
  import { places, events, placeTypes } from '../../db/db.js';
  import { emit, PERSON_SELECTED, DATA_CHANGED } from '../../state.js';
  import { showToast, updateToast, dismissToast } from '../shared/toast-store.js';
  import { batchGeocode } from '../../util/geocode.js';
  import { GeocodeQueue } from '../../util/geocode-queue.js';
  import { decomposeAddress } from '../../util/decompose.js';
  import { ulid } from '../../util/ulid.js';
  import { getCollabState } from '../../config.js';
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
  import { pushModal } from '../shared/modal-stack.svelte.js';
  import ClearableInput from '../shared/ClearableInput.svelte';

  let { onclose, openReview = false } = $props();

  let allPlaces = $state([]);
  let byParent = $state({});
  let expandedEvents = $state({});
  let collapsed = $state({});
  let geocoding = $state(false);
  let abortController = null;
  let geocodeQueue = $state(null);
  let queueCount = $state(0);
  let showReview = $state(false);
  let showTypeSettings = $state(false);
  let openMenu = $state(null);          // 'process' | 'edit' | 'backup'
  let expandedActionsId = $state(null); // place id whose actions are open

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

  function getTreeId() {
    const collab = getCollabState();
    return collab?.treeId || 'local';
  }

  $effect(() => {
    if (!geocodeQueue) {
      geocodeQueue = new GeocodeQueue(getTreeId());
      queueCount = geocodeQueue.count();
      if (openReview && queueCount > 0) {
        showReview = true;
      }
    }
  });

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
    if (!await showConfirm({ title: `Delete "${place.name}"?`, message: 'Children will become root places.', confirm: 'Delete', danger: true })) return;
    await places.delete(place.id);
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

  function handleGeocode() {
    if (geocoding) {
      abortController?.abort();
      return;
    }
    pushModal(GeocodeBatchPicker, {
      treeId: getTreeId(),
      hasQueueEntry: (id) => geocodeQueue?.hasPlace(id),
      onstart: startBatch,
    });
  }

  async function startBatch({ selectedIds, bias, mode }) {
    const selectedSet = new Set(selectedIds);
    const autoAccept = mode === 'auto';
    geocoding = true;
    abortController = new AbortController();
    const toastId = showToast('Starting geocode…', 0);

    try {
      const allPlaces = await places.list();
      const targetPlaces = allPlaces.filter((p) => selectedSet.has(p.id));

      // Inject bias into query by shallow-copying the place objects with modified .name.
      // We don't mutate the DB — we mutate a shallow copy.
      const biased = bias ? targetPlaces.map((p) => {
        const contains = p.name.toLowerCase().includes(bias.toLowerCase());
        return contains ? p : { ...p, name: `${p.name}, ${bias}` };
      }) : targetPlaces;

      const result = await batchGeocode({
        places: biased,
        hasQueueEntry: (id) => geocodeQueue.hasPlace(id),
        onResult: async (place, results) => {
          // `place` here is the biased version; recover the original DB record
          const original = allPlaces.find((p) => p.id === place.id);
          if (autoAccept && results.length > 0) {
            const evts = await places.events(place.id);
            await decomposeAddress({
              nominatimResult: results[0],
              originalPlaceId: place.id,
              eventIds: evts.map((e) => e.id),
              handlers: decompositionHandlers,
              generateId: ulid,
            });
          } else {
            geocodeQueue.addItem({
              place_id: place.id,
              place_name: original?.name ?? place.name,
              query: place.name,  // the biased query
              status: results.length > 0 ? 'ready' : 'no_results',
              results: results.map((r) => ({
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon),
                display_name: r.display_name,
                address: r.address,
                importance: r.importance,
                addresstype: r.addresstype,
                name: r.name,
                class: r.class,
                type: r.type,
              })),
            });
            queueCount = geocodeQueue.count();
          }
        },
        onProgress: (current, total) => {
          updateToast(toastId, `Geocoding ${current}/${total}…`);
        },
        signal: abortController.signal,
      });

      dismissToast(toastId);

      if (result.total === 0) {
        showToast('No places to geocode');
      } else if (autoAccept) {
        const parts = [`Auto-geocoded ${result.fetched}/${result.total} places`];
        if (result.noResults > 0) parts.push(`${result.noResults} not found`);
        showToast(parts.join(', '));
      } else {
        const parts = [`Fetched results for ${result.fetched} places`];
        if (result.noResults > 0) parts.push(`${result.noResults} not found`);
        parts.push('— click Review to triage');
        showToast(parts.join(' '));
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
    queueCount = 0;
    showToast('Queue cleared');
  }

  function formatName(ev) {
    if (ev.person_id) return [ev.given_name, ev.surname].filter(Boolean).join(' ') || 'Unnamed';
    if (ev.participants?.length) return ev.participants.map(p => [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed').join(' & ');
    return 'Unnamed';
  }
</script>

<Modal title="Places" wide={true} onclose={onclose}>
  <div class="places-page">
    <div class="places-toolbar">
      <div class="toolbar-menu" class:open={openMenu === 'process'}>
        <button
          class="btn btn-sm menu-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'process'}
          onclick={(e) => { e.stopPropagation(); openMenu = openMenu === 'process' ? null : 'process'; }}
        >
          Process{queueCount > 0 ? ` (${queueCount})` : ''}{geocoding ? ' …' : ''} <span class="caret" aria-hidden="true">▾</span>
        </button>
        {#if openMenu === 'process'}
          <div class="menu-panel" role="menu">
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => pushModal(MergePlacesPicker, { oncomplete: () => loadData() }))}>
              <span class="menu-item-label">Merge duplicates</span>
              <span class="menu-item-hint">Find and combine duplicate place names</span>
            </button>
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(handleGeocode)}>
              <span class="menu-item-label">{geocoding ? 'Stop geocoding' : 'Geocode'}</span>
              <span class="menu-item-hint">Look up coordinates &amp; build hierarchy from Nominatim</span>
            </button>
            {#if queueCount > 0}
              <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => { showReview = !showReview; })}>
                <span class="menu-item-label">{showReview ? 'Hide review' : `Review (${queueCount})`}</span>
                <span class="menu-item-hint">Triage geocoded results</span>
              </button>
              <button class="menu-item subtle" role="menuitem" onclick={() => runFromMenu(resetQueue)}>
                <span class="menu-item-label">Reset queue</span>
                <span class="menu-item-hint">Discard pending review items</span>
              </button>
            {/if}
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => openOrganizeWizard(() => loadData()))}>
              <span class="menu-item-label">Manual structure</span>
              <span class="menu-item-hint">For historic / non-standard addresses</span>
            </button>
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => pushModal(PlacesHelp, {}))}>
              <span class="menu-item-label">Help</span>
              <span class="menu-item-hint">Step-by-step guide for the places workflow</span>
            </button>
          </div>
        {/if}
      </div>

      <div class="toolbar-menu" class:open={openMenu === 'edit'}>
        <button
          class="btn btn-sm menu-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'edit'}
          onclick={(e) => { e.stopPropagation(); openMenu = openMenu === 'edit' ? null : 'edit'; }}
        >
          Edit <span class="caret" aria-hidden="true">▾</span>
        </button>
        {#if openMenu === 'edit'}
          <div class="menu-panel" role="menu">
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => openPlaceForm(null, () => loadData()))}>
              <span class="menu-item-label">Add place</span>
              <span class="menu-item-hint">Create a new place record</span>
            </button>
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(() => { showTypeSettings = !showTypeSettings; })}>
              <span class="menu-item-label">{showTypeSettings ? 'Hide types' : 'Types'}</span>
              <span class="menu-item-hint">Manage place type labels</span>
            </button>
          </div>
        {/if}
      </div>

      <div class="toolbar-menu" class:open={openMenu === 'backup'}>
        <button
          class="btn btn-sm menu-trigger"
          aria-haspopup="menu"
          aria-expanded={openMenu === 'backup'}
          onclick={(e) => { e.stopPropagation(); openMenu = openMenu === 'backup' ? null : 'backup'; }}
        >
          Backup <span class="caret" aria-hidden="true">▾</span>
        </button>
        {#if openMenu === 'backup'}
          <div class="menu-panel" role="menu">
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(handleExport)}>
              <span class="menu-item-label">Export</span>
              <span class="menu-item-hint">Download places as JSON</span>
            </button>
            <button class="menu-item" role="menuitem" onclick={() => runFromMenu(handleImport)}>
              <span class="menu-item-label">Import</span>
              <span class="menu-item-hint">Restore from a JSON file</span>
            </button>
          </div>
        {/if}
      </div>
    </div>

    {#if showReview && geocodeQueue}
      <GeocodeReview
        queue={geocodeQueue}
        onUpdate={() => {
          queueCount = geocodeQueue.count();
          loadData();
        }}
        onClose={() => { showReview = false; }}
      />
    {/if}

    {#if showTypeSettings}
      <PlaceTypeSettings onClose={() => { showTypeSettings = false; }} />
    {/if}

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
                  {#if place.type}<span class="place-type-badge">{place.type}</span>{/if}
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
    {/if}
  </div>
</Modal>

<style>
  .places-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
    align-items: center;
  }
  .toolbar-menu {
    position: relative;
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
