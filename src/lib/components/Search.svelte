<script>
  import { people } from '../../db/db.js';
  import { emit, PERSON_SELECTED } from '../../state.js';
  import { focusPerson } from '../../ui/tree.js';

  let query = $state('');
  let results = $state([]);
  let open = $state(false);
  let timer = null;
  let inputEl;
  let resultsEl;

  function handleInput(e) {
    query = e.target.value;
    clearTimeout(timer);
    if (!query.trim()) { open = false; return; }
    timer = setTimeout(() => doSearch(query.trim()), 200);
  }

  function handleFocus() {
    if (query.trim() && results.length > 0) open = true;
  }

  async function doSearch(q) {
    const list = await people.search(q);
    results = list.slice(0, 15);
    open = true;
  }

  function select(p) {
    open = false;
    query = '';
    focusPerson(p.id);
    emit(PERSON_SELECTED, p.id);
  }

  function handleClickOutside(e) {
    if (inputEl && !inputEl.contains(e.target) && resultsEl && !resultsEl.contains(e.target)) {
      open = false;
    }
  }

  function formatName(p) {
    return [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div id="search-wrapper">
  <input
    bind:this={inputEl}
    id="search-input"
    type="text"
    placeholder="Search people..."
    autocomplete="off"
    value={query}
    oninput={handleInput}
    onfocus={handleFocus}
  />
  <div bind:this={resultsEl} id="search-results" class:open>
    {#if open}
      {#if results.length === 0}
        <div class="search-result" style="color:var(--text-muted)">No results</div>
      {:else}
        {#each results as p}
          <div class="search-result" onclick={() => select(p)}>
            <span class="search-result-name">{formatName(p)}</span>
            {#if p.birth_year}
              <span class="search-result-year">b. {p.birth_year}</span>
            {/if}
          </div>
        {/each}
      {/if}
    {/if}
  </div>
</div>
