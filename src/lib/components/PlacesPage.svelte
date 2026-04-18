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

  async function handleGeocode() {
    if (geocoding) {
      abortController?.abort();
      return;
    }

    const autoAccept = await showConfirm({
      title: 'Geocode mode',
      message: 'Choose how to handle the results:\n\nAuto-accept = trust the top match for every place (fast, no review).\nReview = queue results for you to confirm one by one.',
      confirm: 'Auto-accept',
    });

    geocoding = true;
    abortController = new AbortController();
    const toastId = showToast('Starting geocode…', 0);

    try {
      const allPlaces = await places.list();

      const result = await batchGeocode({
        places: allPlaces,
        hasQueueEntry: (id) => geocodeQueue.hasPlace(id),
        onResult: async (place, results) => {
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
              place_name: place.name,
              query: place.name,
              status: results.length > 0 ? 'ready' : 'no_results',
              results: results.map((r) => ({
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon),
                display_name: r.display_name,
                address: r.address,
                importance: r.importance,
                addresstype: r.addresstype,
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
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick={() => openPlaceForm(null, () => loadData())}>+ Add Place</button>
      <button class="btn btn-sm" onclick={() => openOrganizeWizard(() => loadData())}>Organize</button>
      <button class="btn btn-sm" onclick={handleExport}>Export</button>
      <button class="btn btn-sm" onclick={handleImport}>Import</button>
      <button class="btn btn-sm" onclick={handleGeocode}>
        {geocoding ? 'Stop Geocoding' : 'Geocode'}
      </button>
      {#if queueCount > 0}
        <button class="btn btn-sm" onclick={() => showReview = !showReview}>
          {showReview ? 'Hide Review' : `Review (${queueCount})`}
        </button>
        <button class="btn btn-sm" onclick={resetQueue}>Reset Queue</button>
      {/if}
      <button class="btn btn-sm" onclick={() => showTypeSettings = !showTypeSettings}>
        {showTypeSettings ? 'Hide Types' : 'Types'}
      </button>
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
      <input type="text" placeholder="Filter places…" bind:value={filterText}>
    </div>

    {#if allPlaces.length === 0}
      <p class="section-empty">No places yet. Add one or import a GEDCOM file.</p>
    {:else}
      {#snippet placeTree(parentKey)}
        <ul class="place-tree">
          {#each getChildren(parentKey) as place}
            <li class="place-tree-item">
              <div class="place-tree-row">
                {#if hasChildren(place.id)}
                  <span class="place-toggle" onclick={() => toggleCollapse(place.id)}>
                    {collapsed[place.id] ? '\u25B6' : '\u25BC'}
                  </span>
                {:else}
                  <span class="place-toggle-spacer"></span>
                {/if}
                <span class="place-tree-name">{place.name}</span>
                {#if place.latitude != null}<span class="place-geocoded" title="Geocoded">&#x1F4CD;</span>{/if}
                {#if place.type}<span class="place-type-badge">{place.type}</span>{/if}
                <button class="btn-link btn-sm place-events-toggle" onclick={(e) => { e.stopPropagation(); toggleEvents(place.id); }}>events</button>
                <span class="place-tree-actions">
                  <button class="btn-link btn-sm" onclick={(e) => { e.stopPropagation(); openPlaceForm(null, () => loadData(), { parent_id: place.id }); }}>+ add</button>
                  <button class="btn-link btn-sm" onclick={(e) => { e.stopPropagation(); openPlaceForm(place.id, () => loadData()); }}>edit</button>
                  <button class="btn-link btn-sm" style="color:var(--danger)" onclick={(e) => { e.stopPropagation(); deletePlace(place); }}>delete</button>
                </span>
              </div>
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
