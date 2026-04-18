<script>
  import Modal from '../forms/Modal.svelte';
  import { places } from '../../db/db.js';
  import { getConfig, setConfig } from '../../config.js';

  let { treeId, hasQueueEntry, onstart, onclose } = $props();
  // onstart({ selectedIds: string[], bias: string, mode: 'auto' | 'review' })

  let allEligible = $state([]);
  let selected = $state(new Set());
  let filterText = $state('');
  let bias = $state(getConfig(`geocode_bias_${treeId}`, '') || '');
  let mode = $state('review');
  let loading = $state(true);

  $effect(() => {
    places.list().then((all) => {
      allEligible = all.filter(
        (p) => p.latitude == null && p.longitude == null && !hasQueueEntry(p.id)
      );
      // Pre-select everything
      selected = new Set(allEligible.map((p) => p.id));
      loading = false;
    });
  });

  let filteredPlaces = $derived.by(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return allEligible;
    return allEligible.filter((p) => p.name.toLowerCase().includes(q));
  });

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  function selectAllVisible() {
    const next = new Set(selected);
    for (const p of filteredPlaces) next.add(p.id);
    selected = next;
  }

  function selectNone() {
    selected = new Set();
  }

  function start() {
    if (selected.size === 0) return;
    const trimmed = bias.trim();
    setConfig(`geocode_bias_${treeId}`, trimmed);
    onstart?.({
      selectedIds: Array.from(selected),
      bias: trimmed,
      mode,
    });
    onclose?.();
  }
</script>

<Modal title="Batch geocode" onclose={onclose}>
  <div class="batch-picker">
    {#if loading}
      <p class="empty">Loading places…</p>
    {:else if allEligible.length === 0}
      <p class="empty">No places need geocoding.</p>
    {:else}
      <div class="picker-controls">
        <input
          type="text"
          class="filter-input"
          placeholder="Filter places…"
          bind:value={filterText}
        />
        <div class="picker-actions">
          <button type="button" class="btn-link btn-sm" onclick={selectAllVisible}>
            Select all ({filteredPlaces.length})
          </button>
          <button type="button" class="btn-link btn-sm" onclick={selectNone}>
            Select none
          </button>
        </div>
      </div>

      <ul class="picker-list">
        {#each filteredPlaces as place (place.id)}
          <li
            class="picker-row"
            class:selected={selected.has(place.id)}
            onclick={() => toggle(place.id)}
            role="option"
            aria-selected={selected.has(place.id)}
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(place.id); } }}
          >
            <input
              type="checkbox"
              checked={selected.has(place.id)}
              tabindex="-1"
              aria-hidden="true"
              class="visually-hidden"
              onclick={(e) => e.stopPropagation()}
              onchange={() => toggle(place.id)}
            />
            <span class="picker-name">{place.name}</span>
            {#if place.type}<span class="picker-type">{place.type}</span>{/if}
          </li>
        {/each}
      </ul>

      <div class="picker-summary">
        {selected.size} of {allEligible.length} selected
      </div>

      <div class="form-group">
        <label for="bias">Region bias (optional)</label>
        <input
          id="bias"
          type="text"
          bind:value={bias}
          placeholder="e.g. Ireland, Massachusetts USA"
        />
        <p class="form-hint">Appended to each query unless the place name already contains it. Leave blank to skip.</p>
      </div>

      <div class="form-group">
        <label>Mode</label>
        <div class="mode-choices">
          <label class="mode-choice">
            <input type="radio" bind:group={mode} value="review" />
            <span>Queue for review</span>
            <small>Pick from top 3 matches per place</small>
          </label>
          <label class="mode-choice">
            <input type="radio" bind:group={mode} value="auto" />
            <span>Auto-accept top</span>
            <small>Trust Nominatim's best match (fast)</small>
          </label>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn" onclick={onclose}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={start} disabled={selected.size === 0}>
          Start geocoding ({selected.size})
        </button>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .batch-picker { display: flex; flex-direction: column; gap: 12px; }
  .empty { color: var(--text-muted, #888); text-align: center; padding: 16px; }
  .picker-controls { display: flex; gap: 8px; align-items: center; }
  .filter-input { flex: 1; padding: 4px 8px; }
  .picker-actions { display: flex; gap: 4px; }
  .picker-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 320px;
    overflow-y: auto;
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
  }
  .picker-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color, #eee);
    transition: background 60ms ease;
    user-select: none;
  }
  .picker-row:last-child { border-bottom: none; }
  .picker-row:hover { background: var(--bg-hover, #f5f5f5); }
  .picker-row.selected {
    background: var(--bg-selected, #e8f4ff);
    color: var(--text-selected, #0c3c66);
  }
  .picker-row.selected:hover { background: var(--bg-selected-hover, #d5ebff); }
  .picker-row:focus { outline: 2px solid var(--accent-color, #3498db); outline-offset: -2px; }
  .picker-name { flex: 1; font-size: 0.9rem; }
  .picker-type {
    font-size: 0.75rem;
    color: var(--text-muted, #888);
    text-transform: uppercase;
  }
  .picker-row.selected .picker-type { color: inherit; opacity: 0.8; }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .picker-summary { color: var(--text-muted, #888); font-size: 0.85rem; }
  .mode-choices { display: flex; flex-direction: column; gap: 6px; }
  .mode-choice {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 6px 10px;
    cursor: pointer;
    padding: 4px 0;
  }
  .mode-choice small { color: var(--text-muted, #888); }
</style>
