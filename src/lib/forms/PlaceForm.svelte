<script>
  import { places } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';
  import PlacePicker from '../pickers/PlacePicker.svelte';
  import { openPlaceForm } from '../shared/open.js';
  import { PLACE_TYPES, formatPlaceType } from '../../util/place-types.js';

  let { placeId = null, onclose, oncomplete } = $props();

  const sortedTypes = [...PLACE_TYPES].sort((a, b) => !a ? 1 : !b ? -1 : formatPlaceType(a).localeCompare(formatPlaceType(b)));

  let name = $state('');
  let type = $state('');
  let selectedParentId = $state(null);
  let notes = $state('');
  let isEdit = $state(false);
  let title = $state('New Place');
  let parentName = $state('');
  let pickerRef;

  $effect(() => {
    if (placeId) {
      isEdit = true;
      places.get(placeId).then(async (p) => {
        if (!p) { onclose?.(); return; }
        name = p.name || '';
        type = p.type || '';
        selectedParentId = p.parent_id || null;
        notes = p.notes || '';
        title = `Edit ${p.name}`;
        if (selectedParentId) {
          const parent = await places.get(selectedParentId);
          if (parent && pickerRef) pickerRef.setValue(parent.name);
        }
      });
    }
  });

  function handleParentSelect(p) {
    selectedParentId = p.id;
  }

  function handleParentCreate() {
    openPlaceForm(null, (newPlace) => {
      selectedParentId = newPlace.id;
      if (pickerRef) pickerRef.setValue(newPlace.name);
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      type,
      parent_id: selectedParentId,
      notes: notes.trim(),
    };

    if (!data.name) {
      showToast('Name is required');
      return;
    }

    try {
      if (isEdit) {
        const updated = await places.update(placeId, data);
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
      <input id="plf-name" type="text" bind:value={name} autocomplete="off">
    </div>
    <div class="form-group">
      <label for="plf-type">Type</label>
      <select id="plf-type" bind:value={type}>
        {#each sortedTypes as t}
          <option value={t}>{t ? formatPlaceType(t) : '(none)'}</option>
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
      <label for="plf-notes">Notes</label>
      <textarea id="plf-notes" rows="2" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
