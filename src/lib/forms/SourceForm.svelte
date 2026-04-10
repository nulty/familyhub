<script>
  import { sources, repositories } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openRepositoryForm } from '../shared/open.js';
  import Modal from './Modal.svelte';

  const SOURCE_TYPES = [
    { value: '', label: '(unspecified)' },
    { value: 'document', label: 'Document' },
    { value: 'register', label: 'Register' },
    { value: 'census', label: 'Census' },
    { value: 'webpage', label: 'Webpage' },
    { value: 'book', label: 'Book' },
    { value: 'newspaper', label: 'Newspaper' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'photograph', label: 'Photograph' },
    { value: 'other', label: 'Other' },
  ];

  let { sourceId = null, onclose, oncomplete, prefill = null } = $props();

  let sourceTitle = $state('');
  let type = $state('');
  let selectedRepoId = $state(null);
  let repoQuery = $state('');
  let repoResults = $state([]);
  let repoOpen = $state(false);
  let url = $state('');
  let author = $state('');
  let publisher = $state('');
  let year = $state('');
  let notes = $state('');
  let isEdit = $state(false);
  let title = $state('New Source');
  let repoTimer = null;
  let repoInputEl;
  let original = null;

  $effect(() => {
    if (sourceId) {
      isEdit = true;
      title = 'Edit Source';
      sources.get(sourceId).then((s) => {
        if (!s) { onclose?.(); return; }
        sourceTitle = s.title || '';
        type = s.type || '';
        selectedRepoId = s.repository_id || null;
        repoQuery = s.repository_name || '';
        url = s.url || '';
        author = s.author || '';
        publisher = s.publisher || '';
        year = s.year || '';
        notes = s.notes || '';
        original = {
          title: (s.title || '').trim(),
          type: s.type || '',
          repository_id: s.repository_id || null,
          url: (s.url || '').trim(),
          author: (s.author || '').trim(),
          publisher: (s.publisher || '').trim(),
          year: (s.year || '').toString().trim(),
          notes: (s.notes || '').trim(),
        };
      });
    } else if (prefill) {
      selectedRepoId = prefill.repository_id || null;
      repoQuery = prefill.repository_name || '';
    }
  });

  function handleRepoInput(e) {
    repoQuery = e.target.value;
    selectedRepoId = null;
    clearTimeout(repoTimer);
    if (!repoQuery.trim()) { repoResults = []; repoOpen = false; return; }
    repoTimer = setTimeout(async () => {
      repoResults = await repositories.search(repoQuery.trim());
      repoOpen = true;
    }, 200);
  }

  function selectRepo(r) {
    repoQuery = r.name;
    selectedRepoId = r.id;
    repoOpen = false;
  }

  function handleNewRepo() {
    openRepositoryForm(null, (newRepo) => {
      repoQuery = newRepo.name;
      selectedRepoId = newRepo.id;
    });
  }

  function handleRepoClickOutside(e) {
    if (repoInputEl && !repoInputEl.parentElement.contains(e.target)) {
      repoOpen = false;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const data = {
      title: sourceTitle.trim(),
      type,
      repository_id: selectedRepoId,
      url: url.trim(),
      author: author.trim(),
      publisher: publisher.trim(),
      year: year.trim(),
      notes: notes.trim(),
    };

    if (!data.title) {
      showToast('Title is required');
      return;
    }

    try {
      if (isEdit) {
        const dirty = !original
          || data.title !== original.title
          || data.type !== original.type
          || data.repository_id !== original.repository_id
          || data.url !== original.url
          || data.author !== original.author
          || data.publisher !== original.publisher
          || data.year !== original.year
          || data.notes !== original.notes;
        const updated = dirty ? await sources.update(sourceId, data) : { id: sourceId, ...data };
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Source updated');
        oncomplete?.(updated);
      } else {
        const created = await sources.create(data);
        onclose?.();
        emit(DATA_CHANGED);
        showToast(`Created ${data.title}`);
        oncomplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<svelte:document onclick={handleRepoClickOutside} />

<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <div class="form-group">
      <label for="sf-title">Title</label>
      <input id="sf-title" type="text" bind:value={sourceTitle} autocomplete="off">
      <span class="form-hint">The collection or publication — e.g. "IrishGenealogy.ie — Civil Birth Records"</span>
    </div>
    <div class="form-group">
      <label for="sf-type">Type</label>
      <select id="sf-type" bind:value={type}>
        {#each SOURCE_TYPES as t}
          <option value={t.value}>{t.label}</option>
        {/each}
      </select>
    </div>
    <div class="form-group" style="position:relative">
      <label for="sf-repo">Repository</label>
      <input
        bind:this={repoInputEl}
        id="sf-repo"
        type="text"
        value={repoQuery}
        oninput={handleRepoInput}
        placeholder="Search repositories..."
        autocomplete="off"
      >
      {#if repoOpen && repoResults.length > 0}
        <div class="place-suggestions" style="display:block">
          {#each repoResults as r}
            <div class="place-suggestion" onclick={() => selectRepo(r)}>
              {r.name}{r.type ? ` (${r.type})` : ''}
            </div>
          {/each}
        </div>
      {/if}
      <button type="button" class="btn btn-sm btn-link" onclick={handleNewRepo}>+ New repository</button>
      <span class="form-hint">The organisation that holds the original records</span>
    </div>
    <div class="form-group">
      <label for="sf-url">URL</label>
      <input id="sf-url" type="text" bind:value={url} placeholder="https://..." autocomplete="off">
      <span class="form-hint">Base URL of the online collection (specific record links go on citations)</span>
    </div>
    <div class="form-group">
      <label for="sf-author">Author</label>
      <input id="sf-author" type="text" bind:value={author} autocomplete="off">
    </div>
    <div class="form-group">
      <label for="sf-publisher">Publisher</label>
      <input id="sf-publisher" type="text" bind:value={publisher} autocomplete="off">
    </div>
    <div class="form-group">
      <label for="sf-year">Year</label>
      <input id="sf-year" type="text" bind:value={year} placeholder="e.g. 1901" autocomplete="off" style="width:120px">
    </div>
    <div class="form-group">
      <label for="sf-notes">Notes</label>
      <textarea id="sf-notes" rows="2" bind:value={notes}></textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
