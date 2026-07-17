<script>
  import { places, placeTypes, events } from '../../db/db.js';
  import { emit, DATA_CHANGED, PICK_LOCATION } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';
  import PlacePicker from '../pickers/PlacePicker.svelte';
  import { openPlaceForm } from '../shared/open.js';
  import { groupTypes } from '../../util/place-type-seeds.js';
  import { geocodeSearch, reverseGeocode } from '../../util/geocode.js';
  import { GeocodeQueue } from '../../util/geocode-queue.js';
  import { getTreeId } from '../../config.js';
  import { decomposeAddress, getResultChain } from '../../util/decompose.js';
  import { ulid } from '../../util/ulid.js';

  let { placeId = null, prefill = null, onclose, oncomplete } = $props();

  let typeOptions = $state([]);

  // ─── Manual fields ──────────────────────────────────────────────────────────
  let name = $state(prefill?.name || '');
  let type = $state(prefill?.type || '');
  let selectedParentId = $state(prefill?.parent_id || null);
  let latitude = $state(prefill?.latitude != null ? String(prefill.latitude) : '');
  let longitude = $state(prefill?.longitude != null ? String(prefill.longitude) : '');
  let notes = $state(prefill?.notes || '');
  let isEdit = $state(false);
  let title = $state(prefill?.title || 'New Place');
  let pickerRef;
  let original = null;

  // Manual section is open straight away when editing, when we're returning
  // from a "pick on map" round-trip (prefill carries field values), or for
  // "Add child" (prefill.parent_id) — the search/decompose path builds its own
  // hierarchy and would silently discard a preset parent. For a fresh create it
  // stays collapsed behind the disclosure.
  let manualOpen = $state(!!placeId || !!(prefill && (prefill.name || prefill.latitude != null || prefill.parent_id != null)));

  // ─── Search (Nominatim lookup) ───────────────────────────────────────────────
  let query = $state(prefill?.name || '');
  let searching = $state(false);
  let searched = $state(false);
  let searchResults = $state([]);
  let selectedIdx = $state(-1);
  let committing = $state(false);

  let selectedChain = $derived(
    selectedIdx >= 0 && searchResults[selectedIdx]
      ? getResultChain(searchResults[selectedIdx])
      : []
  );

  const canCommit = $derived(
    (selectedIdx >= 0) || (manualOpen && name.trim() !== '')
  );

  $effect(() => {
    placeTypes.list().then(types => { typeOptions = types; });
  });

  $effect(() => {
    if (!placeId && prefill?.parent_id) {
      places.get(prefill.parent_id).then((parent) => {
        if (parent && pickerRef) pickerRef.setValue(parent.name);
      });
    }
    if (placeId) {
      isEdit = true;
      places.get(placeId).then(async (p) => {
        if (!p) { onclose?.(); return; }
        if (!prefill) {
          name = p.name || '';
          type = p.type || '';
          selectedParentId = p.parent_id || null;
          latitude = p.latitude != null ? String(p.latitude) : '';
          longitude = p.longitude != null ? String(p.longitude) : '';
          notes = p.notes || '';
        }
        title = prefill?.title || `Edit ${p.name}`;
        const pid = prefill?.parent_id ?? p.parent_id;
        if (pid) {
          selectedParentId = pid;
          const parent = await places.get(pid);
          if (parent && pickerRef) pickerRef.setValue(parent.name);
        }
        // Seed the search box with the full hierarchy so a re-lookup is one click.
        const chain = await places.hierarchy(placeId);
        const TYPE_PREFIX = { county: 'County' };
        query = chain.map(c => {
          const prefix = TYPE_PREFIX[c.type];
          return prefix ? `${prefix} ${c.name}` : c.name;
        }).reverse().join(', ');
        original = {
          name: (p.name || '').trim(),
          type: p.type || '',
          parent_id: pid || null,
          latitude: p.latitude != null ? parseFloat(p.latitude) : null,
          longitude: p.longitude != null ? parseFloat(p.longitude) : null,
          notes: (p.notes || '').trim(),
        };
      });
    }
  });

  // Map-pick return (new place with coords): reverse-geocode the picked point
  // and offer its hierarchy as a one-click candidate. The picked coordinates
  // are kept — Nominatim's centroid may differ from where the user pointed.
  // Failure is silent: manual entry (with the coords prefilled) still works.
  let reverseTried = false;
  $effect(() => {
    if (reverseTried || placeId || !prefill || prefill.latitude == null) return;
    reverseTried = true;
    (async () => {
      searching = true;
      try {
        const lat = parseFloat(prefill.latitude);
        const lon = parseFloat(prefill.longitude);
        const result = await reverseGeocode(lat, lon);
        if (result) {
          searchResults = [{ ...result, lat, lon }];
          searched = true;
          selectResult(0);
        }
      } catch { /* offline or Nominatim down */ }
      finally { searching = false; }
    })();
  });

  function focusOnMount(node) {
    requestAnimationFrame(() => node.focus());
  }

  function handleParentSelect(p) {
    selectedParentId = p.id;
  }

  function handleParentCreate() {
    openPlaceForm(null, (newPlace) => {
      selectedParentId = newPlace.id;
      if (pickerRef) pickerRef.setValue(newPlace.name);
    });
  }

  const decompositionHandlers = {
    findPlaceByNameTypeParent: (n, t, p) => places.findByNameTypeParent(n, t, p),
    createPlace: (d) => places.create(d),
    ensurePlaceType: (k) => placeTypes.ensure(k),
    updatePlace: (id, f) => places.update(id, f),
    updateEvent: (id, f) => events.update(id, f),
    deletePlace: (id) => places.delete(id),
  };

  async function runSearch() {
    if (!query.trim() || searching) return;
    searching = true;
    selectedIdx = -1;
    try {
      searchResults = await geocodeSearch(query.trim());
      searched = true;
    } catch (err) {
      showToast('Search failed: ' + err.message);
    } finally {
      searching = false;
    }
  }

  function selectResult(idx) {
    selectedIdx = idx;
    manualOpen = false; // search pick and manual entry are mutually exclusive
  }

  function openManual() {
    manualOpen = true;
    selectedIdx = -1;
  }

  async function commitSearchResult() {
    const result = searchResults[selectedIdx];
    let eventIds = [];
    if (isEdit) {
      const evts = await places.events(placeId);
      eventIds = evts.map(e => e.id);
    }
    const lastId = await decomposeAddress({
      nominatimResult: result,
      originalPlaceId: isEdit ? placeId : null,
      eventIds,
      handlers: decompositionHandlers,
      generateId: ulid,
    });
    if (!lastId) {
      showToast('That result has no address detail — try another or enter it manually');
      return;
    }
    // Decompose may have replaced (deleted) the original flat record — drop
    // any geocode-queue entry it left behind.
    if (isEdit) new GeocodeQueue(getTreeId()).removeItem(placeId);
    const place = await places.get(lastId);
    onclose?.();
    emit(DATA_CHANGED);
    showToast(`${isEdit ? 'Updated' : 'Created'} ${place.name}`);
    oncomplete?.(place);
  }

  async function commitManual() {
    const data = {
      name: name.trim(),
      type,
      parent_id: selectedParentId,
      latitude: latitude.trim() !== '' ? parseFloat(latitude) : null,
      longitude: longitude.trim() !== '' ? parseFloat(longitude) : null,
      notes: notes.trim(),
    };
    if (!data.name) {
      showToast('Name is required');
      return;
    }
    if (isEdit) {
      const dirty = !original
        || data.name !== original.name
        || data.type !== original.type
        || data.parent_id !== original.parent_id
        || data.latitude !== original.latitude
        || data.longitude !== original.longitude
        || data.notes !== original.notes;
      const updated = dirty ? await places.update(placeId, data) : { id: placeId, ...data };
      // Assigning a type resolves the place — it leaves the geocode funnel.
      if (data.type) new GeocodeQueue(getTreeId()).removeItem(placeId);
      onclose?.();
      emit(DATA_CHANGED);
      showToast('Place updated');
      oncomplete?.(updated);
    } else {
      const created = await places.create(data);
      // Untyped places are invisible to search until organized — feed
      // coordinate-less ones into the geocode funnel so they can't be forgotten.
      let queued = false;
      if (!data.type && data.latitude == null) {
        queued = new GeocodeQueue(getTreeId()).addPendingPlaces([created]) > 0;
      }
      onclose?.();
      emit(DATA_CHANGED);
      showToast(queued
        ? `Created ${data.name} — queued for geocoding so it becomes searchable`
        : `Created ${data.name}`);
      oncomplete?.(created);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (committing) return;
    committing = true;
    try {
      if (selectedIdx >= 0 && !manualOpen) {
        await commitSearchResult();
      } else {
        await commitManual();
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    } finally {
      committing = false;
    }
  }

  function handlePickOnMap() {
    const formState = {
      name, type, parent_id: selectedParentId, latitude, longitude, notes,
      title: isEdit ? title : undefined,
    };
    emit(PICK_LOCATION, { placeId, formState, oncomplete });
    onclose?.();
  }
</script>

<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <!-- ─── Search: look it up ─────────────────────────────────────────────── -->
    <div class="form-group">
      <label for="plf-search">Search for a place</label>
      <div class="search-row">
        <input
          id="plf-search"
          type="text"
          bind:value={query}
          autocomplete="off"
          placeholder="e.g. Rathmines, Dublin, Ireland"
          use:focusOnMount
          onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); } }}
        >
        <button type="button" class="btn btn-primary btn-sm" onclick={runSearch} disabled={searching || !query.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
      </div>
      <p class="form-hint">We look it up and fill in the coordinates and region automatically.</p>

      {#if searchResults.length > 0}
        <ul class="search-results">
          {#each searchResults as result, idx (idx)}
            <li>
              <button
                type="button"
                class="result"
                class:selected={idx === selectedIdx}
                onclick={() => selectResult(idx)}
              >
                <span class="result-main">
                  <span class="result-name">{result.name || result.display_name}</span>
                  <span class="result-sub">{result.display_name}</span>
                </span>
                {#if result.addresstype || result.type}
                  <span class="chip">{result.addresstype || result.type}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {:else if searched && !searching}
        <p class="no-results">No matches. Refine the search above, or enter it manually below.</p>
      {/if}

      {#if selectedChain.length > 0}
        <div class="will-create">
          <span class="tick">✓</span>
          <span>
            Will {isEdit ? 'set' : 'create'}
            {#each selectedChain as part, i (i)}<b>{part.name}</b>{#if i < selectedChain.length - 1}<span class="sep"> › </span>{/if}{/each}
          </span>
        </div>
      {/if}
    </div>

    <!-- ─── Manual entry (disclosure) ──────────────────────────────────────── -->
    <div class="disclosure">
      {#if !manualOpen}
        <button type="button" class="disclosure-toggle" onclick={openManual}>
          Can't find it? Enter manually
        </button>
      {:else}
        <div class="manual-fields">
          <div class="form-group">
            <label for="plf-name">Name</label>
            <input id="plf-name" type="text" bind:value={name} autocomplete="off">
          </div>
          <div class="form-group">
            <label for="plf-type">Type</label>
            <select id="plf-type" bind:value={type}>
              <option value="">(none)</option>
              {#each groupTypes(typeOptions) as group (group.label)}
                <optgroup label={group.label}>
                  {#each group.types as t (t.key)}
                    <option value={t.key}>{t.label}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
          </div>
          <div class="form-group">
            <label>Parent Place</label>
            <PlacePicker
              bind:this={pickerRef}
              onselect={handleParentSelect}
              excludeIds={placeId ? [placeId] : []}
              oncreate={handleParentCreate}
            />
          </div>
          <div class="form-group">
            <div class="coord-head">
              <label>Coordinates</label>
              <button type="button" class="btn btn-sm" onclick={handlePickOnMap}>📍 Pick on map</button>
            </div>
            <details class="coord-advanced">
              <summary>or enter coordinates manually</summary>
              <div class="coord-grid">
                <input type="number" step="any" min="-90" max="90" bind:value={latitude} placeholder="Latitude">
                <input type="number" step="any" min="-180" max="180" bind:value={longitude} placeholder="Longitude">
              </div>
            </details>
          </div>
          <div class="form-group">
            <label for="plf-notes">Notes</label>
            <textarea id="plf-notes" rows="2" bind:value={notes}></textarea>
          </div>
        </div>
      {/if}
    </div>

    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary" disabled={!canCommit || committing}>
        {isEdit ? 'Save' : 'Create'}
      </button>
    </div>
  </form>
</Modal>

<style>
  .search-row { display: flex; gap: 0.5rem; }
  .search-row input { flex: 1; }

  .search-results {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .search-results li { border-bottom: 1px solid var(--border); }
  .search-results li:last-child { border-bottom: none; }
  .result {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 8px 10px;
    cursor: pointer;
    font: inherit;
  }
  .result:hover { background: #f7f9ff; }
  .result.selected { background: #eef3ff; box-shadow: inset 3px 0 0 var(--accent); }
  .result-main { flex: 1; min-width: 0; }
  .result-name { display: block; font-size: 14px; }
  .result-sub {
    display: block;
    font-size: 12px;
    color: var(--text-muted, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--accent);
    background: #eef2fb;
    padding: 2px 8px;
    border-radius: 999px;
  }
  .no-results {
    margin: 0.5rem 0 0;
    font-size: 13px;
    color: var(--text-muted, #666);
  }
  .will-create {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: 0.5rem;
    padding: 8px 10px;
    background: #edf7ee;
    border: 1px solid #cbe7cd;
    border-radius: var(--radius);
    font-size: 13px;
  }
  .will-create .tick { color: #3f7a44; }
  .will-create .sep { color: #3f7a44; }

  .disclosure { margin-top: 1rem; }
  .disclosure-toggle {
    background: none;
    border: none;
    color: var(--accent);
    cursor: pointer;
    font: inherit;
    font-size: 13px;
    padding: 0;
  }
  .disclosure-toggle:hover { text-decoration: underline; }
  .manual-fields {
    padding-top: 0.75rem;
    border-top: 1px solid var(--border);
  }
  .coord-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .coord-advanced { margin-top: 0.5rem; }
  .coord-advanced summary {
    font-size: 12.5px;
    color: var(--accent);
    cursor: pointer;
  }
  .coord-grid { display: flex; gap: 0.5rem; margin-top: 0.5rem; }
  .coord-grid input { flex: 1; }
</style>
