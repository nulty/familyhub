<script>
  import { repositories } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from './Modal.svelte';

  const REPO_TYPES = [
    { value: '', label: '(unspecified)' },
    { value: 'government', label: 'Government Office' },
    { value: 'archive', label: 'Archive' },
    { value: 'church', label: 'Church' },
    { value: 'library', label: 'Library' },
    { value: 'website', label: 'Website' },
    { value: 'database', label: 'Online Database' },
    { value: 'personal', label: 'Personal Collection' },
    { value: 'other', label: 'Other' },
  ];

  let { repoId = null, onclose, oncomplete } = $props();

  let name = $state('');
  let type = $state('');
  let url = $state('');
  let address = $state('');
  let notes = $state('');
  let isEdit = $state(false);
  let title = $state('New Repository');
  let original = null;

  $effect(() => {
    if (repoId) {
      isEdit = true;
      repositories.get(repoId).then((r) => {
        if (!r) { onclose?.(); return; }
        name = r.name || '';
        type = r.type || '';
        url = r.url || '';
        address = r.address || '';
        notes = r.notes || '';
        title = `Edit ${r.name}`;
        original = {
          name: (r.name || '').trim(),
          type: r.type || '',
          url: (r.url || '').trim(),
          address: (r.address || '').trim(),
          notes: (r.notes || '').trim(),
        };
      });
    }
  });

  async function handleSubmit(e) {
    e.preventDefault();
    const data = {
      name: name.trim(),
      type,
      url: url.trim(),
      address: address.trim(),
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
          || data.url !== original.url
          || data.address !== original.address
          || data.notes !== original.notes;
        const updated = dirty ? await repositories.update(repoId, data) : { id: repoId, ...data };
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Repository updated');
        oncomplete?.(updated);
      } else {
        const created = await repositories.create(data);
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
      <label for="rf-name">Name</label>
      <input id="rf-name" type="text" bind:value={name} autocomplete="off">
      <span class="form-hint">The organisation that holds the original records — e.g. "General Register Office", "St Mary's Parish"</span>
    </div>
    <div class="form-group">
      <label for="rf-type">Type</label>
      <select id="rf-type" bind:value={type}>
        {#each REPO_TYPES as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </div>
    <div class="form-group">
      <label for="rf-url">URL</label>
      <input id="rf-url" type="text" bind:value={url} placeholder="https://..." autocomplete="off">
      <span class="form-hint">Website of the repository itself (if any)</span>
    </div>
    <div class="form-group">
      <label for="rf-address">Address</label>
      <textarea id="rf-address" rows="2" placeholder="Physical address" bind:value={address}></textarea>
    </div>
    <div class="form-group">
      <label for="rf-notes">Notes</label>
      <textarea id="rf-notes" rows="2" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
