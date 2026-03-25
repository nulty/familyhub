<script>
  import { citations } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openSourceForm } from '../../forms/source-form.js';
  import Modal from './Modal.svelte';
  import SourcePicker from '../pickers/SourcePicker.svelte';

  const CONFIDENCE_OPTIONS = [
    { value: '', label: '(unspecified)' },
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'questionable', label: 'Questionable' },
  ];

  let { citationId = null, onclose, oncomplete, prefill = null } = $props();

  let selectedSourceId = $state(null);
  let selectedSourceTitle = $state('');
  let showPicker = $state(true);
  let detail = $state('');
  let url = $state('');
  let accessed = $state('');
  let confidence = $state('');
  let notes = $state('');
  let isEdit = $state(false);
  let title = $state('New Citation');

  $effect(() => {
    if (citationId) {
      isEdit = true;
      title = 'Edit Citation';
      citations.get(citationId).then((c) => {
        if (!c) { onclose?.(); return; }
        selectedSourceId = c.source_id || null;
        detail = c.detail || '';
        url = c.url || '';
        accessed = c.accessed || '';
        confidence = c.confidence || '';
        notes = c.notes || '';
        if (selectedSourceId) showPicker = false;
      });
    } else if (prefill) {
      selectedSourceId = prefill.source_id || null;
      selectedSourceTitle = prefill.source_title || '';
      if (selectedSourceId) showPicker = false;
    }
  });

  function handleSourceSelect(source) {
    selectedSourceId = source.id;
    selectedSourceTitle = source.title;
    showPicker = false;
  }

  function handleSourceCreate() {
    openSourceForm(null, (newSource) => {
      selectedSourceId = newSource.id;
      selectedSourceTitle = newSource.title;
      showPicker = false;
    });
  }

  function changeSource() {
    selectedSourceId = null;
    selectedSourceTitle = '';
    showPicker = true;
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedSourceId) {
      showToast('Please select a source');
      return;
    }

    const data = {
      source_id: selectedSourceId,
      detail: detail.trim(),
      url: url.trim(),
      accessed: accessed.trim(),
      confidence,
      notes: notes.trim(),
    };

    if (!isEdit && prefill?.event_id) {
      data.event_id = prefill.event_id;
    }

    try {
      if (isEdit) {
        const updated = await citations.update(citationId, data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Citation updated');
        oncomplete?.(updated);
      } else {
        if (!data.event_id) {
          showToast('No event linked — citation needs an event');
          return;
        }
        const created = await citations.create(data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Citation created');
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
      <label>Source</label>
      {#if showPicker}
        <SourcePicker onselect={handleSourceSelect} oncreate={handleSourceCreate} />
      {:else}
        <div class="citation-source-row">
          <span class="citation-source-label">{selectedSourceTitle || '(source selected)'}</span>
          <button type="button" class="btn-link btn-sm" onclick={changeSource}>change</button>
        </div>
      {/if}
    </div>
    <div class="form-group">
      <label for="cf-detail">Detail</label>
      <input id="cf-detail" type="text" bind:value={detail} placeholder="Page, entry, volume..." autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-url">Direct URL</label>
      <input id="cf-url" type="text" bind:value={url} placeholder="https://... link to specific record" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-accessed">Date Accessed</label>
      <input id="cf-accessed" type="text" bind:value={accessed} placeholder="e.g. 2025-03-25" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-confidence">Confidence</label>
      <select id="cf-confidence" bind:value={confidence}>
        {#each CONFIDENCE_OPTIONS as o}
          <option value={o.value}>{o.label}</option>
        {/each}
      </select>
    </div>
    <div class="form-group">
      <label for="cf-notes">Notes</label>
      <textarea id="cf-notes" rows="2" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
