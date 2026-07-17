<script>
  import PanelShell from '../forms/PanelShell.svelte';
  import { places } from '../../db/db.js';
  import { getConfig, setConfig } from '../../config.js';
  import ClearableInput from '../shared/ClearableInput.svelte';

  let { treeId, isQueueBlocked, onstart, onclose, embedded = false } = $props();
  // onstart({ selectedIds: string[], bias: string })

  let allEligible = $state([]);
  let selected = $state(new Set());
  let filterText = $state('');
  let bias = $state(getConfig(`geocode_bias_${treeId}`, '') || '');
  let loading = $state(true);
  let anchorId = $state(null);

  $effect(() => {
    places.list().then((all) => {
      // Eligible: no coordinates, and not already fetched (pending queue entries
      // ARE eligible — this run is what resolves them).
      allEligible = all.filter(
        (p) => p.latitude == null && p.longitude == null && !isQueueBlocked(p.id)
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
    anchorId = id;
  }

  function rangeSelect(targetId) {
    if (!anchorId || anchorId === targetId) {
      toggle(targetId);
      return;
    }
    const ids = filteredPlaces.map((p) => p.id);
    const anchorIdx = ids.indexOf(anchorId);
    const targetIdx = ids.indexOf(targetId);
    if (anchorIdx === -1 || targetIdx === -1) {
      toggle(targetId);
      return;
    }
    const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const next = new Set(selected);
    for (let i = lo; i <= hi; i++) next.add(ids[i]);
    selected = next;
  }

  function handleRowClick(e, id) {
    if (e.shiftKey) {
      e.preventDefault();
      rangeSelect(id);
    } else {
      toggle(id);
    }
  }

  function handleRowKey(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) rangeSelect(id);
      else toggle(id);
    }
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
    });
    onclose?.();
  }
</script>

<PanelShell title="Batch geocode" {embedded} onclose={onclose}>
  <div class="batch-picker">
    {#if loading}
      <p class="empty">Loading places…</p>
    {:else if allEligible.length === 0}
      <p class="empty">No places need geocoding.</p>
    {:else}
      <div class="picker-controls">
        <ClearableInput
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
            onclick={(e) => handleRowClick(e, place.id)}
            role="option"
            aria-selected={selected.has(place.id)}
            tabindex="0"
            onkeydown={(e) => handleRowKey(e, place.id)}
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

      <p class="form-hint">
        Places with a single unambiguous match are applied automatically; multiple
        matches go to Review, and no-match places go to Correct.
      </p>

      <div class="form-actions">
        <button type="button" class="btn" onclick={onclose}>Cancel</button>
        <button type="button" class="btn btn-primary" onclick={start} disabled={selected.size === 0}>
          Start geocoding ({selected.size})
        </button>
      </div>
    {/if}
  </div>
</PanelShell>

<style>
  .batch-picker { display: flex; flex-direction: column; gap: 12px; }
  .empty { color: var(--text-muted, #888); text-align: center; padding: 16px; }
  .picker-controls { display: flex; gap: 8px; align-items: center; }
  .picker-controls :global(.clearable-input) { flex: 1; }
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
</style>
