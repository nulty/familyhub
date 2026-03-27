<script>
  import { citations } from '../../db/db.js';

  let { onselect, excludeIds = [] } = $props();

  let query = $state('');
  let results = $state([]);
  let open = $state(false);
  let timer = null;
  let inputEl;

  function doSearch(q) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const list = await citations.search(q);
      results = list.filter(c => !excludeIds.includes(c.id)).slice(0, 20);
      open = results.length > 0 || q.length > 0;
    }, 200);
  }

  function handleInput(e) {
    query = e.target.value;
    if (query.trim()) doSearch(query.trim());
    else { results = []; open = false; }
  }

  function handleFocus() {
    if (query.trim()) doSearch(query.trim());
  }

  function select(item) {
    query = '';
    open = false;
    onselect?.(item);
  }

  function handleClickOutside(e) {
    if (inputEl && !inputEl.parentElement.contains(e.target)) {
      open = false;
    }
  }

  function formatCitation(c) {
    const parts = [];
    if (c.source_title) parts.push(c.source_title);
    if (c.detail) parts.push(c.detail);
    if (c.url && !c.source_title?.includes(c.url)) parts.push(c.url);
    return parts.join(' — ') || '(untitled citation)';
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div class="person-picker">
  <input
    bind:this={inputEl}
    type="text"
    placeholder="Search existing citations..."
    autocomplete="off"
    value={query}
    oninput={handleInput}
    onfocus={handleFocus}
  />
  {#if open}
    <div class="picker-results" style="display: block">
      {#each results as c}
        <div class="picker-result" onclick={() => select(c)}>
          {formatCitation(c)}
        </div>
      {/each}
      {#if results.length === 0}
        <div class="picker-empty">No matching citations</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .person-picker { position: relative; }

  .person-picker input {
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 14px;
    outline: none;
  }

  .person-picker input:focus { border-color: var(--accent); }

  .picker-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    box-shadow: var(--shadow);
  }

  .picker-result {
    padding: 7px 10px;
    cursor: pointer;
    font-size: 13px;
  }

  .picker-result:hover { background: #f0f4ff; }

  .picker-empty {
    padding: 7px 10px;
    font-size: 13px;
    color: var(--text-muted);
  }

  @media (max-width: 768px) {
    .picker-result, .picker-empty { padding: 10px 12px; }
    .person-picker input { padding: 10px 12px; font-size: 16px; }
  }
</style>
