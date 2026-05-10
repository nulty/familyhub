<script>
  import { places, placeTypes, events } from '../../db/db.js';
  import { decomposeAddress, getResultChain } from '../../util/decompose.js';
  import { showToast } from '../shared/toast-store.js';
  import { ulid } from '../../util/ulid.js';

  let { queue, onUpdate, onClose } = $props();

  function getAddressParts(result) {
    return getResultChain(result);
  }

  let items = $state([]);
  let editQueries = $state({});
  let processing = $state(false);

  function refresh() {
    items = queue.getItems();
  }

  $effect(() => { refresh(); });

  let readyItems = $derived(items.filter(i => i.status === 'ready'));
  let noResultItems = $derived(items.filter(i => i.status === 'no_results'));

  const decompositionHandlers = {
    findPlaceByNameTypeParent: (name, type, parentId) => places.findByNameTypeParent(name, type, parentId),
    createPlace: (data) => places.create(data),
    ensurePlaceType: (key) => placeTypes.ensure(key),
    updatePlace: (id, fields) => places.update(id, fields),
    updateEvent: (id, fields) => events.update(id, fields),
    deletePlace: (id) => places.delete(id),
  };

  async function accept(item, resultIndex, stopAtKey = null) {
    const result = item.results[resultIndex];
    try {
      const evts = await places.events(item.place_id);
      const eventIds = evts.map(e => e.id);

      await decomposeAddress({
        nominatimResult: result,
        originalPlaceId: item.place_id,
        eventIds,
        handlers: decompositionHandlers,
        generateId: ulid,
        stopAtKey,
      });

      queue.removeItem(item.place_id);
      refresh();
      onUpdate?.();
      showToast(`Accepted: ${item.place_name}`);
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }

  async function acceptAll() {
    if (processing) return;
    processing = true;
    try {
      // Snapshot current ready items — accept() mutates the queue
      const toAccept = [...readyItems];
      for (const item of toAccept) {
        await accept(item, 0);
      }
    } finally {
      processing = false;
    }
  }

  function skip(item) {
    queue.removeItem(item.place_id);
    refresh();
    onUpdate?.();
  }

  async function retry(item) {
    const newQuery = editQueries[item.place_id] ?? item.query;
    if (!newQuery.trim()) {
      showToast('Query cannot be empty');
      return;
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
        q: newQuery, format: 'json', limit: '3', addressdetails: '1',
      })}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Sinsear/0.2.0' } });
      if (!res.ok) { showToast('Geocode request failed'); return; }
      const data = await res.json();
      queue.updateItem(item.place_id, {
        query: newQuery,
        status: data.length > 0 ? 'ready' : 'no_results',
        results: data.map(r => ({
          lat: parseFloat(r.lat), lon: parseFloat(r.lon),
          display_name: r.display_name, address: r.address,
          importance: r.importance, addresstype: r.addresstype,
          name: r.name, class: r.class, type: r.type,
        })),
      });
      refresh();
      onUpdate?.();
    } catch (err) {
      showToast('Geocode error: ' + err.message);
    }
  }
</script>

<div class="geocode-review">
  <div class="review-header">
    <h3>Review geocode results</h3>
    <div class="review-actions">
      {#if readyItems.length > 0}
        <button class="btn btn-sm btn-primary" onclick={acceptAll} disabled={processing}>
          Accept all top results
        </button>
      {/if}
      <button class="btn btn-sm" onclick={onClose}>Close</button>
    </div>
  </div>

  {#if items.length === 0}
    <p class="review-empty">All done — no items to review.</p>
  {/if}

  {#if readyItems.length > 0}
    <h4>Results ({readyItems.length})</h4>
    {#each readyItems as item (item.place_id)}
      <div class="review-item">
        <div class="review-item-header">
          <strong>{item.place_name}</strong>
          <button class="btn-link btn-sm" onclick={() => skip(item)}>Skip</button>
        </div>
        <ul class="review-results">
          {#each item.results as result, idx}
            {@const parts = getAddressParts(result)}
            <li class="result-row">
              <div class="result-meta">
                <span class="result-display" title={result.display_name}>{result.display_name}</span>
                {#if result.importance != null}
                  <span class="importance">{(result.importance * 100).toFixed(0)}%</span>
                {/if}
              </div>
              {#if parts.length > 0}
                <div class="level-chips" aria-label="Click a level to accept truncated there">
                  {#each parts as part, pIdx}
                    <button
                      class="level-chip"
                      class:full={pIdx === parts.length - 1}
                      title={`Accept at ${part.type} level`}
                      onclick={() => accept(item, idx, part.type)}
                    >{part.name}</button>
                    {#if pIdx < parts.length - 1}<span class="chip-sep" aria-hidden="true">›</span>{/if}
                  {/each}
                </div>
              {:else}
                <button class="btn-accept" onclick={() => accept(item, idx)}>
                  Accept (no address breakdown)
                </button>
              {/if}
            </li>
          {/each}
        </ul>
        <div class="retry-row">
          <input
            type="text"
            value={editQueries[item.place_id] ?? item.query}
            oninput={(e) => editQueries = { ...editQueries, [item.place_id]: e.target.value }}
            placeholder="Edit query and press Retry"
          />
          <button class="btn btn-sm" onclick={() => retry(item)}>Retry</button>
        </div>
      </div>
    {/each}
  {/if}

  {#if noResultItems.length > 0}
    <h4>No results ({noResultItems.length})</h4>
    {#each noResultItems as item (item.place_id)}
      <div class="review-item review-item-empty">
        <div class="review-item-header">
          <strong>{item.place_name}</strong>
          <button class="btn-link btn-sm" onclick={() => skip(item)}>Skip</button>
        </div>
        <div class="retry-row">
          <input
            type="text"
            value={editQueries[item.place_id] ?? item.query}
            oninput={(e) => editQueries = { ...editQueries, [item.place_id]: e.target.value }}
            placeholder="Edit query and press Retry"
          />
          <button class="btn btn-sm" onclick={() => retry(item)}>Retry</button>
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .geocode-review {
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
    padding: 12px;
    margin-top: 12px;
    background: var(--bg-elevated, #fafafa);
  }
  .review-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .review-header h3 { margin: 0; font-size: 1rem; }
  .review-actions { display: flex; gap: 6px; }
  .geocode-review h4 {
    margin: 12px 0 6px;
    font-size: 0.9rem;
    color: var(--text-muted, #666);
  }
  .review-item {
    border: 1px solid var(--border-color, #ddd);
    border-radius: 4px;
    padding: 8px 10px;
    margin-bottom: 6px;
    background: var(--bg, #fff);
  }
  .review-item-empty { background: var(--bg-warning, #fff8e6); }
  .review-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
  }
  .review-results {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .result-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 0;
    border-bottom: 1px dashed var(--border-color, #eee);
  }
  .result-row:last-child { border-bottom: none; }
  .result-meta {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .result-display {
    flex: 1;
    font-size: 0.8rem;
    color: var(--text-muted, #666);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .level-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .level-chip {
    background: none;
    border: 1px solid var(--accent-color, #3498db);
    border-radius: 3px;
    padding: 2px 8px;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text, #333);
  }
  .level-chip:hover {
    background: var(--accent-color, #3498db);
    color: #fff;
  }
  .level-chip.full {
    border-style: solid;
  }
  .chip-sep {
    color: var(--text-muted, #888);
    font-size: 0.85rem;
  }
  .btn-accept {
    background: none;
    border: 1px solid var(--accent-color, #3498db);
    border-radius: 3px;
    padding: 3px 8px;
    cursor: pointer;
    text-align: left;
    flex: 1;
    font-size: 0.85rem;
    color: var(--text, #333);
  }
  .btn-accept:hover {
    background: var(--accent-color, #3498db);
    color: #fff;
  }
  .importance {
    color: var(--text-muted, #888);
    font-size: 0.75rem;
    min-width: 36px;
    text-align: right;
  }
  .retry-row {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .retry-row input { flex: 1; padding: 3px 6px; font-size: 0.85rem; }
  .review-empty {
    color: var(--text-muted, #888);
    text-align: center;
    padding: 16px;
  }
</style>
