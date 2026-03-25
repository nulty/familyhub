<script>
  import { people } from '../../db/db.js';

  let { onselect, excludeIds = [], oncreate } = $props();

  let query = $state('');
  let results = $state([]);
  let open = $state(false);
  let timer = null;
  let inputEl;

  function doSearch(q) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const list = await people.search(q);
      results = list.filter(p => !excludeIds.includes(p.id)).slice(0, 20);
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
    const name = [item.given_name, item.surname].filter(Boolean).join(' ') || 'Unnamed';
    query = name;
    open = false;
    onselect?.(item);
  }

  function handleCreate() {
    open = false;
    oncreate?.();
  }

  function handleClickOutside(e) {
    if (inputEl && !inputEl.parentElement.contains(e.target)) {
      open = false;
    }
  }

  export function focus() {
    setTimeout(() => inputEl?.focus(), 50);
  }

  export function setValue(val) {
    query = val;
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div class="person-picker">
  <input
    bind:this={inputEl}
    type="text"
    placeholder="Search by name..."
    autocomplete="off"
    value={query}
    oninput={handleInput}
    onfocus={handleFocus}
  />
  {#if open}
    <div class="picker-results" style="display: block">
      {#each results as p}
        <div class="picker-result" onclick={() => select(p)}>
          {[p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed'}
        </div>
      {/each}
      <div class="picker-create" onclick={handleCreate}>+ Create new person...</div>
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

  .picker-create {
    padding: 7px 10px;
    cursor: pointer;
    font-size: 13px;
    color: var(--accent);
    border-top: 1px solid var(--border);
  }

  .picker-create:hover { background: #f0f4ff; }

  @media (max-width: 768px) {
    .picker-result, .picker-create { padding: 10px 12px; }
    .person-picker input { padding: 10px 12px; font-size: 16px; }
  }
</style>
