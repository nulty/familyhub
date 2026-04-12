<script>
  import { repositories, sources, citations } from '../../db/db.js';
  import { emit, PERSON_SELECTED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openRepositoryForm, openSourceForm } from '../shared/open.js';
  import { focusPerson } from '../../ui/tree.js';
  import Modal from '../forms/Modal.svelte';
  import { showConfirm } from '../shared/confirm.js';

  let { onclose } = $props();

  let allRepos = $state([]);
  let allSources = $state([]);
  let expandedCitations = $state({});

  $effect(() => { loadData(); });

  async function loadData() {
    allRepos = await repositories.list();
    allSources = await sources.list();
  }

  let orphanSources = $derived(allSources.filter(s => !s.repository_id));

  function getRepoSources(repoId) {
    return allSources.filter(s => s.repository_id === repoId);
  }

  async function deleteRepo(repoId) {
    if (!await showConfirm({ title: 'Delete repository?', message: 'Sources will be kept but unlinked.', confirm: 'Delete', danger: true })) return;
    await repositories.delete(repoId);
    showToast('Repository deleted');
    await loadData();
  }

  async function deleteSource(src) {
    if (!await showConfirm({ title: `Delete "${src.title}"?`, message: 'All citations to this source will be removed.', confirm: 'Delete', danger: true })) return;
    await sources.delete(src.id);
    showToast('Source deleted');
    await loadData();
  }

  async function toggleCitations(sourceId) {
    if (expandedCitations[sourceId]) {
      expandedCitations = { ...expandedCitations, [sourceId]: null };
    } else {
      const list = await citations.listForSource(sourceId);
      expandedCitations = { ...expandedCitations, [sourceId]: list };
    }
  }

  function navigateToPerson(personId) {
    focusPerson(personId);
    emit(PERSON_SELECTED, personId);
    onclose?.();
  }

  function formatName(c) {
    if (c.participant_names) return c.participant_names;
    return [c.given_name, c.surname].filter(Boolean).join(' ') || 'Unnamed';
  }
</script>

<Modal title="Sources & Repositories" wide={true} onclose={onclose}>
  <div class="sources-page">
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick={() => openRepositoryForm(null, () => loadData())}>+ Repository</button>
      <button class="btn btn-sm" onclick={() => openSourceForm(null, () => loadData())}>+ Source</button>
    </div>

    <div class="sources-stats">{allRepos.length} repositories, {allSources.length} sources</div>

    {#each allRepos as repo}
      {@const repoSources = getRepoSources(repo.id)}
      <details class="sources-repo-section" open>
        <summary class="sources-repo-header">
          <span class="sources-repo-name">{repo.name}</span>
          {#if repo.type}<span class="sources-repo-type">{repo.type}</span>{/if}
          {#if repo.url}<a href={repo.url} target="_blank" rel="noopener" class="sources-repo-url" onclick={(e) => e.stopPropagation()}>{repo.url}</a>{/if}
          <span class="sources-repo-count">({repoSources.length})</span>
          <span class="sources-repo-actions">
            <button class="btn btn-sm sources-add-btn" onclick={(e) => { e.stopPropagation(); openSourceForm(null, () => loadData(), { repository_id: repo.id, repository_name: repo.name }); }}>+ Source</button>
            <button class="btn-link btn-sm" onclick={(e) => { e.stopPropagation(); openRepositoryForm(repo.id, () => loadData()); }}>edit</button>
            <button class="btn-link btn-sm" style="color:var(--danger)" onclick={(e) => { e.stopPropagation(); deleteRepo(repo.id); }}>delete</button>
          </span>
        </summary>
        <div class="sources-list">
          {#each repoSources as src}
            <div class="sources-source-row">
              <span class="sources-source-title">{src.title}</span>
              {#if src.type}<span class="sources-source-type">{src.type}</span>{/if}
              {#if src.url}<a href={src.url} target="_blank" rel="noopener" class="sources-source-url">link</a>{/if}
              <span class="sources-source-actions">
                <button class="btn-link btn-sm" onclick={() => toggleCitations(src.id)}>citations</button>
                <button class="btn-link btn-sm" onclick={() => openSourceForm(src.id, () => loadData())}>edit</button>
                <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => deleteSource(src)}>delete</button>
              </span>
            </div>
            {#if expandedCitations[src.id]}
              <div class="source-citations-list">
                {#if expandedCitations[src.id].length === 0}
                  <div class="section-empty" style="padding:4px 0 4px 16px">No citations</div>
                {:else}
                  {#each expandedCitations[src.id] as c}
                    <div class="source-citation-row">
                      <span class="source-citation-event">{c.event_type}</span>
                      {#if c.event_date}<span class="source-citation-date">{c.event_date}</span>{/if}
                      <a href="#" class="source-citation-person" onclick={(e) => { e.preventDefault(); navigateToPerson(c.person_id); }}>{formatName(c)}</a>
                      {#if c.detail}<span class="source-citation-detail">{c.detail}</span>{/if}
                      {#if c.url}<a href={c.url} target="_blank" rel="noopener" class="source-citation-url">link</a>{/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          {/each}
          {#if repoSources.length === 0}
            <div class="section-empty">No sources</div>
          {/if}
        </div>
      </details>
    {/each}

    {#if orphanSources.length > 0}
      <details class="sources-repo-section" open>
        <summary class="sources-repo-header">
          <span class="sources-repo-name">No Repository</span>
          <span class="sources-repo-count">({orphanSources.length})</span>
        </summary>
        <div class="sources-list">
          {#each orphanSources as src}
            <div class="sources-source-row">
              <span class="sources-source-title">{src.title}</span>
              {#if src.type}<span class="sources-source-type">{src.type}</span>{/if}
              {#if src.url}<a href={src.url} target="_blank" rel="noopener" class="sources-source-url">link</a>{/if}
              <span class="sources-source-actions">
                <button class="btn-link btn-sm" onclick={() => toggleCitations(src.id)}>citations</button>
                <button class="btn-link btn-sm" onclick={() => openSourceForm(src.id, () => loadData())}>edit</button>
                <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => deleteSource(src)}>delete</button>
              </span>
            </div>
            {#if expandedCitations[src.id]}
              <div class="source-citations-list">
                {#if expandedCitations[src.id].length === 0}
                  <div class="section-empty" style="padding:4px 0 4px 16px">No citations</div>
                {:else}
                  {#each expandedCitations[src.id] as c}
                    <div class="source-citation-row">
                      <span class="source-citation-event">{c.event_type}</span>
                      {#if c.event_date}<span class="source-citation-date">{c.event_date}</span>{/if}
                      <a href="#" class="source-citation-person" onclick={(e) => { e.preventDefault(); navigateToPerson(c.person_id); }}>{formatName(c)}</a>
                      {#if c.detail}<span class="source-citation-detail">{c.detail}</span>{/if}
                      {#if c.url}<a href={c.url} target="_blank" rel="noopener" class="source-citation-url">link</a>{/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </details>
    {/if}

    {#if allRepos.length === 0 && allSources.length === 0}
      <div class="section-empty" style="padding:24px 0">No repositories or sources yet. Import a GEDCOM file or add them manually.</div>
    {/if}
  </div>
</Modal>
