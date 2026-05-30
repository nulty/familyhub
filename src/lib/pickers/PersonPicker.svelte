<script>
  import { people } from '../../db/db.js';

  let { onselect, excludeIds = [], oncreate } = $props();

  let query = $state('');
  let results = $state([]);
  let open = $state(false);
  let timer = null;
  let inputEl;
  let resultsEl = $state(null);

  // Anchor the fixed-position results list to the input's on-screen rect so it
  // floats above the modal instead of being clipped by its overflow.
  function positionResults() {
    if (!inputEl || !resultsEl) return;
    const r = inputEl.getBoundingClientRect();
    resultsEl.style.left = `${r.left}px`;
    resultsEl.style.top = `${r.bottom}px`;
    resultsEl.style.width = `${r.width}px`;
  }

  $effect(() => {
    if (!open || !resultsEl) return;
    positionResults();
    // Capture phase so scrolling inside the modal body (an ancestor) is caught too.
    window.addEventListener('scroll', positionResults, true);
    window.addEventListener('resize', positionResults);
    return () => {
      window.removeEventListener('scroll', positionResults, true);
      window.removeEventListener('resize', positionResults);
    };
  });

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
    if (!open) return;
    if (inputEl && inputEl.parentElement.contains(e.target)) return;
    // Click landed outside the open dropdown. Close it and consume the click so
    // it doesn't also dismiss an enclosing modal (its backdrop click handler).
    // A second click then dismisses the modal as usual.
    open = false;
    e.stopPropagation();
  }

  export function focus() {
    setTimeout(() => inputEl?.focus(), 50);
  }

  export function setValue(val) {
    query = val;
  }
</script>

<svelte:document onclickcapture={handleClickOutside} />

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
    <div class="picker-results" bind:this={resultsEl} style="display: block">
      {#each results as p}
        <div class="picker-result" onclick={() => select(p)}>
          {[p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed'}{p.birth_year ? ` (b. ${p.birth_year})` : ''}
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
    position: fixed;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
    max-height: 200px;
    overflow-y: auto;
    z-index: 1100;
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
