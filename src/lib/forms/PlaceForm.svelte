<script>
  import { places, placeTypes } from '../../db/db.js';
  import { emit, DATA_CHANGED, PICK_LOCATION } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';
  import PlacePicker from '../pickers/PlacePicker.svelte';
  import { openPlaceForm, openPlacesPage } from '../shared/open.js';
  import { GeocodeQueue } from '../../util/geocode-queue.js';
  import { getCollabState } from '../../config.js';

  let { placeId = null, prefill = null, onclose, oncomplete } = $props();

  let typeOptions = $state([]);

  let name = $state(prefill?.name || '');
  let type = $state(prefill?.type || '');
  let selectedParentId = $state(prefill?.parent_id || null);
  let latitude = $state(prefill?.latitude || '');
  let longitude = $state(prefill?.longitude || '');
  let notes = $state(prefill?.notes || '');
  let isEdit = $state(false);
  let title = $state(prefill?.title || 'New Place');
  let parentName = $state('');
  let pickerRef;
  let geocodeQuery = $state('');
  let geocodeOpen = $state(false);
  let geocodeLoading = $state(false);
  let original = null;

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
        // Only set fields that weren't provided via prefill
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

  function getTreeId() {
    const collab = getCollabState();
    return collab?.treeId || 'local';
  }

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

  async function openGeocode() {
    if (geocodeOpen) { geocodeOpen = false; return; }
    const id = isEdit ? placeId : null;
    if (id) {
      const chain = await places.hierarchy(id);
      const TYPE_PREFIX = { county: 'County' };
      geocodeQuery = chain.map(p => {
        const prefix = TYPE_PREFIX[p.type];
        return prefix ? `${prefix} ${p.name}` : p.name;
      }).reverse().join(', ');
    } else {
      geocodeQuery = name;
    }
    geocodeOpen = true;
  }

  async function runGeocode() {
    if (!geocodeQuery.trim()) return;
    if (!name.trim()) {
      showToast('Place needs a name before geocoding');
      return;
    }
    geocodeLoading = true;
    try {
      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        q: geocodeQuery.trim(), format: 'json', limit: '3', addressdetails: '1',
      })}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Sinsear/0.2.0' } });
      if (!res.ok) { showToast('Geocode request failed'); return; }
      const data = await res.json();

      // Ensure we have a saved place to queue against
      let targetPlaceId = placeId;
      if (!targetPlaceId) {
        const parentIdValue = selectedParentId || null;
        const created = await places.create({
          name: name.trim(),
          type: type || '',
          parent_id: parentIdValue,
          notes: notes || '',
        });
        targetPlaceId = created.id;
      } else if (isEdit) {
        // Save any pending field edits so the user doesn't lose them
        await places.update(targetPlaceId, {
          name: name.trim(),
          type: type || '',
          parent_id: selectedParentId || null,
          notes: notes || '',
        });
      }

      // Add to queue
      const queue = new GeocodeQueue(getTreeId());
      queue.addItem({
        place_id: targetPlaceId,
        place_name: name.trim(),
        query: geocodeQuery.trim(),
        status: data.length > 0 ? 'ready' : 'no_results',
        results: data.map(r => ({
          lat: parseFloat(r.lat),
          lon: parseFloat(r.lon),
          display_name: r.display_name,
          address: r.address,
          importance: r.importance,
          addresstype: r.addresstype,
        })),
      });

      emit(DATA_CHANGED);
      showToast(data.length > 0 ? 'Queued for review' : 'No results — queued for retry');

      // Close PlaceForm and open PlacesPage with review panel
      onclose?.();
      openPlacesPage({ openReview: true });
    } catch (err) {
      showToast('Geocode error: ' + err.message);
    } finally {
      geocodeLoading = false;
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

  async function handleSubmit(e) {
    e.preventDefault();
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

    try {
      if (isEdit) {
        const dirty = !original
          || data.name !== original.name
          || data.type !== original.type
          || data.parent_id !== original.parent_id
          || data.latitude !== original.latitude
          || data.longitude !== original.longitude
          || data.notes !== original.notes;
        const updated = dirty ? await places.update(placeId, data) : { id: placeId, ...data };
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Place updated');
        oncomplete?.(updated);
      } else {
        const created = await places.create(data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast(`Created ${data.name}`);
        oncomplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <div class="form-group">
      <label for="plf-name">Name</label>
      <input id="plf-name" type="text" bind:value={name} autocomplete="off" use:focusOnMount>
    </div>
    <div class="form-group">
      <label for="plf-type">Type</label>
      <select id="plf-type" bind:value={type}>
        <option value="">(none)</option>
        {#each typeOptions.slice().sort((a, b) => a.label.localeCompare(b.label)) as t (t.key)}
          <option value={t.key}>{t.label}</option>
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
      <div style="display:flex;align-items:center;justify-content:space-between">
        <label>Coordinates</label>
        <div style="display:flex;gap:8px">
          <button type="button" class="btn-link btn-sm" onclick={openGeocode}>Geocode</button>
          <button type="button" class="btn-link btn-sm" onclick={handlePickOnMap}>Pick on map</button>
        </div>
      </div>
      {#if geocodeOpen}
        <div style="display:flex;gap:0.5rem;margin-bottom:0.5rem">
          <input type="text" bind:value={geocodeQuery} placeholder="Search query…" style="flex:1" onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runGeocode(); } }}>
          <button type="button" class="btn btn-primary btn-sm" onclick={runGeocode} disabled={geocodeLoading}>
            {geocodeLoading ? 'Searching…' : 'Search'}
          </button>
        </div>
      {/if}
      <div style="display:flex;gap:0.5rem">
        <input id="plf-lat" type="number" step="any" min="-90" max="90" bind:value={latitude} placeholder="Latitude">
        <input id="plf-lng" type="number" step="any" min="-180" max="180" bind:value={longitude} placeholder="Longitude">
      </div>
    </div>
    <div class="form-group">
      <label for="plf-notes">Notes</label>
      <textarea id="plf-notes" rows="2" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
