<script>
  import Modal from '../forms/Modal.svelte';
  import { places, events } from '../../db/db.js';
  import { showToast } from '../shared/toast-store.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { normalizePlaceName } from '../../gedcom/import.js';
  import ClearableInput from '../shared/ClearableInput.svelte';

  let { onclose, oncomplete } = $props();

  let loading = $state(true);
  let groups = $state([]);  // [{ key, places: [...], keepId, dismissed, eventCounts }]

  // Flat multi-select state
  let allCandidates = $state([]);  // all untyped orphan places
  let selectedIds = $state(new Set());
  let keepId = $state(null);  // which selected row is the keep target
  let filterText = $state('');
  let anchorId = $state(null);  // for shift-click range
  let eventCountsAll = $state({});  // placeId -> event count

  async function loadGroups() {
    loading = true;
    const all = await places.list();
    const candidates = all.filter((p) => p.type === '' && p.parent_id == null);
    allCandidates = candidates;

    const byKey = new Map();
    for (const p of candidates) {
      const key = normalizePlaceName(p.name);
      if (!key) continue;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(p);
    }
    groups = Array.from(byKey.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([key, arr]) => ({
        key,
        places: arr,
        keepId: arr[0].id,
        dismissed: false,
        eventCounts: {},
      }));

    // Load event counts per place in parallel
    await Promise.all(groups.flatMap((g) =>
      g.places.map(async (p) => {
        const evts = await places.events(p.id);
        g.eventCounts[p.id] = evts.length;
      })
    ));

    // Re-pick the keep target based on event counts
    for (const g of groups) {
      let bestId = g.places[0].id;
      let bestCount = g.eventCounts[bestId] ?? 0;
      for (const p of g.places) {
        const c = g.eventCounts[p.id] ?? 0;
        if (c > bestCount) {
          bestId = p.id;
          bestCount = c;
        }
      }
      g.keepId = bestId;
    }

    // Store flat event counts from grouped places
    const newEventCountsAll = {};
    for (const g of groups) {
      for (const p of g.places) {
        newEventCountsAll[p.id] = g.eventCounts[p.id] ?? 0;
      }
    }

    // For candidates NOT in any group, load event counts separately
    const groupedIds = new Set();
    for (const g of groups) for (const p of g.places) groupedIds.add(p.id);
    const ungrouped = candidates.filter(p => !groupedIds.has(p.id));
    await Promise.all(ungrouped.map(async (p) => {
      const evts = await places.events(p.id);
      newEventCountsAll[p.id] = evts.length;
    }));

    eventCountsAll = newEventCountsAll;
    loading = false;
  }

  $effect(() => { loadGroups(); });

  let visibleGroups = $derived(groups.filter((g) => !g.dismissed));

  let filteredCandidates = $derived.by(() => {
    const q = filterText.trim().toLowerCase();
    if (!q) return allCandidates;
    return allCandidates.filter(p => p.name.toLowerCase().includes(q));
  });

  function setKeep(groupIdx, placeId) {
    groups = groups.map((g, i) => i === groupIdx ? { ...g, keepId: placeId } : g);
  }

  function skip(groupIdx) {
    groups = groups.map((g, i) => i === groupIdx ? { ...g, dismissed: true } : g);
  }

  async function mergeGroup(groupIdx) {
    const g = groups[groupIdx];
    const keep = g.places.find((p) => p.id === g.keepId);
    if (!keep) return;
    const others = g.places.filter((p) => p.id !== g.keepId);

    try {
      for (const other of others) {
        // 1. Repoint all events from `other` to `keep`
        const evts = await places.events(other.id);
        for (const ev of evts) {
          await events.update(ev.id, { place_id: keep.id, place: '' });
        }
        // 2. Merge coords (if keep lacks them and other has them)
        if (keep.latitude == null && other.latitude != null) {
          await places.update(keep.id, { latitude: other.latitude, longitude: other.longitude });
          keep.latitude = other.latitude;
          keep.longitude = other.longitude;
        }
        // 3. Merge notes
        if (other.notes) {
          const merged = [keep.notes, other.notes].filter(Boolean).join('\n---\n');
          if (merged !== keep.notes) {
            await places.update(keep.id, { notes: merged });
            keep.notes = merged;
          }
        }
        // 4. Delete the other place
        await places.delete(other.id);
      }
      showToast(`Merged ${others.length} into "${keep.name}"`);
      emit(DATA_CHANGED);
      oncomplete?.();
      // Dismiss this group from the view
      groups = groups.map((g2, i) => i === groupIdx ? { ...g2, dismissed: true } : g2);
    } catch (err) {
      showToast('Merge failed: ' + err.message);
    }
  }

  // --- Flat multi-select logic ---

  function updateKeepTarget() {
    if (keepId && selectedIds.has(keepId)) return;
    let bestId = null;
    let bestCount = -1;
    for (const id of selectedIds) {
      const c = eventCountsAll[id] ?? 0;
      if (c > bestCount) {
        bestId = id;
        bestCount = c;
      }
    }
    keepId = bestId;
  }

  function toggleOne(id) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
    anchorId = id;
    updateKeepTarget();
  }

  function rangeSelect(targetId) {
    if (!anchorId || anchorId === targetId) {
      toggleOne(targetId);
      return;
    }
    const ids = filteredCandidates.map(p => p.id);
    const anchorIdx = ids.indexOf(anchorId);
    const targetIdx = ids.indexOf(targetId);
    if (anchorIdx === -1 || targetIdx === -1) {
      toggleOne(targetId);
      return;
    }
    const [lo, hi] = anchorIdx < targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    const next = new Set(selectedIds);
    for (let i = lo; i <= hi; i++) next.add(ids[i]);
    selectedIds = next;
    updateKeepTarget();
  }

  function handleRowClick(e, id) {
    if (e.shiftKey) {
      e.preventDefault();
      rangeSelect(id);
    } else {
      toggleOne(id);
    }
  }

  function handleRowKey(e, id) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (e.shiftKey) rangeSelect(id);
      else toggleOne(id);
    }
  }

  function selectAllVisible() {
    const next = new Set(selectedIds);
    for (const p of filteredCandidates) next.add(p.id);
    selectedIds = next;
    updateKeepTarget();
  }

  function selectNone() {
    selectedIds = new Set();
    keepId = null;
  }

  async function mergeSelected() {
    if (selectedIds.size < 2 || !keepId) return;
    const keep = allCandidates.find(p => p.id === keepId);
    if (!keep) return;
    const others = Array.from(selectedIds)
      .filter(id => id !== keepId)
      .map(id => allCandidates.find(p => p.id === id))
      .filter(Boolean);

    try {
      for (const other of others) {
        const evts = await places.events(other.id);
        for (const ev of evts) {
          await events.update(ev.id, { place_id: keep.id, place: '' });
        }
        if (keep.latitude == null && other.latitude != null) {
          await places.update(keep.id, { latitude: other.latitude, longitude: other.longitude });
          keep.latitude = other.latitude;
          keep.longitude = other.longitude;
        }
        if (other.notes) {
          const merged = [keep.notes, other.notes].filter(Boolean).join('\n---\n');
          if (merged !== keep.notes) {
            await places.update(keep.id, { notes: merged });
            keep.notes = merged;
          }
        }
        await places.delete(other.id);
      }
      showToast(`Merged ${others.length} into "${keep.name}"`);
      emit(DATA_CHANGED);
      oncomplete?.();
      // Reset and reload
      selectedIds = new Set();
      keepId = null;
      anchorId = null;
      await loadGroups();
    } catch (err) {
      showToast('Merge failed: ' + err.message);
    }
  }
</script>

<Modal title="Merge duplicate places" onclose={onclose}>
  <div class="merge-picker">
    {#if loading}
      <p class="empty">Scanning places…</p>
    {:else if visibleGroups.length === 0}
      <p class="empty">No duplicate groups found.</p>
    {:else}
      <p class="hint">
        Untyped flat places with matching normalized names. Click a row to set it as the one to keep, then click Merge.
      </p>
      {#each visibleGroups as group, gIdx (group.key)}
        <div class="merge-group">
          <div class="group-header">
            <strong>{group.key}</strong>
            <span class="group-count">{group.places.length} records</span>
          </div>
          <ul class="merge-list" role="listbox">
            {#each group.places as p (p.id)}
              <li
                class="merge-row"
                class:keep={p.id === group.keepId}
                onclick={() => setKeep(groups.indexOf(group), p.id)}
                role="option"
                aria-selected={p.id === group.keepId}
                tabindex="0"
                onkeydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setKeep(groups.indexOf(group), p.id);
                  }
                }}
              >
                <span class="row-name">{p.name}</span>
                <span class="row-meta">
                  {group.eventCounts[p.id] ?? 0} events
                  {#if p.latitude != null} · pinned{/if}
                </span>
                {#if p.id === group.keepId}
                  <span class="keep-badge">KEEP</span>
                {/if}
              </li>
            {/each}
          </ul>
          <div class="group-actions">
            <button type="button" class="btn btn-sm" onclick={() => skip(groups.indexOf(group))}>Skip</button>
            <button type="button" class="btn btn-sm btn-primary" onclick={() => mergeGroup(groups.indexOf(group))}>
              Merge {group.places.length - 1} into 1
            </button>
          </div>
        </div>
      {/each}
    {/if}

    {#if !loading && allCandidates.length > 0}
      <div class="flat-section">
        <h4>All untyped places ({allCandidates.length})</h4>
        <p class="hint">Multi-select places to merge that aren't auto-grouped. Click rows to toggle; shift-click for range.</p>

        <div class="flat-controls">
          <ClearableInput
            class="filter-input"
            placeholder="Filter…"
            bind:value={filterText}
          />
          <button type="button" class="btn-link btn-sm" onclick={selectAllVisible}>
            Select all ({filteredCandidates.length})
          </button>
          <button type="button" class="btn-link btn-sm" onclick={selectNone}>
            Select none
          </button>
        </div>

        <ul class="flat-list" role="listbox">
          {#each filteredCandidates as p (p.id)}
            <li
              class="flat-row"
              class:selected={selectedIds.has(p.id)}
              onclick={(e) => handleRowClick(e, p.id)}
              role="option"
              aria-selected={selectedIds.has(p.id)}
              tabindex="0"
              onkeydown={(e) => handleRowKey(e, p.id)}
            >
              <span class="row-name">{p.name}</span>
              <span class="row-meta">
                {eventCountsAll[p.id] ?? 0} events
                {#if p.latitude != null} · pinned{/if}
              </span>
            </li>
          {/each}
        </ul>

        {#if selectedIds.size >= 2}
          <div class="merge-bar">
            <h4>Merge {selectedIds.size} selected</h4>
            <p class="hint">Click to set the keep target:</p>
            <ul class="merge-preview">
              {#each Array.from(selectedIds) as id}
                {@const p = allCandidates.find(x => x.id === id)}
                {#if p}
                  <li
                    class="preview-row"
                    class:keep={id === keepId}
                    onclick={() => keepId = id}
                    role="option"
                    aria-selected={id === keepId}
                    tabindex="0"
                    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); keepId = id; } }}
                  >
                    <span class="row-name">{p.name}</span>
                    {#if id === keepId}<span class="keep-badge">KEEP</span>{/if}
                  </li>
                {/if}
              {/each}
            </ul>
            <div class="merge-action">
              <button type="button" class="btn btn-sm btn-primary" onclick={mergeSelected}>
                Merge {selectedIds.size - 1} into 1
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="form-actions">
      <button type="button" class="btn" onclick={onclose}>Close</button>
    </div>
  </div>
</Modal>

<style>
  .merge-picker { display: flex; flex-direction: column; gap: 12px; }
  .empty { color: var(--text-muted, #888); text-align: center; padding: 16px; }
  .hint { color: var(--text-muted, #666); font-size: 0.85rem; margin: 0; }
  .merge-group {
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
    padding: 10px;
    background: var(--bg-elevated, #fafafa);
  }
  .group-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .group-count { color: var(--text-muted, #888); font-size: 0.8rem; }
  .merge-list { list-style: none; padding: 0; margin: 0 0 8px; border: 1px solid var(--border-color, #eee); border-radius: 4px; background: #fff; }
  .merge-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color, #eee);
    transition: background 60ms ease;
    user-select: none;
  }
  .merge-row:last-child { border-bottom: none; }
  .merge-row:hover { background: var(--bg-hover, #f5f5f5); }
  .merge-row.keep { background: var(--bg-selected, #e8f4ff); color: var(--text-selected, #0c3c66); }
  .merge-row.keep:hover { background: var(--bg-selected-hover, #d5ebff); }
  .merge-row:focus { outline: 2px solid var(--accent-color, #3498db); outline-offset: -2px; }
  .row-name { flex: 1; font-size: 0.9rem; }
  .row-meta { color: var(--text-muted, #888); font-size: 0.8rem; }
  .merge-row.keep .row-meta { color: inherit; opacity: 0.8; }
  .keep-badge {
    font-size: 0.7rem;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--accent-color, #3498db);
    color: #fff;
  }
  .group-actions { display: flex; justify-content: flex-end; gap: 6px; }

  .flat-section {
    border-top: 1px solid var(--border-color, #ddd);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .flat-section h4 { margin: 0; font-size: 0.9rem; }
  .flat-controls { display: flex; gap: 6px; align-items: center; }
  .filter-input { flex: 1; padding: 4px 8px; }
  .flat-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border-color, #eee);
    border-radius: 4px;
    background: #fff;
  }
  .flat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color, #eee);
    transition: background 60ms ease;
    user-select: none;
  }
  .flat-row:last-child { border-bottom: none; }
  .flat-row:hover { background: var(--bg-hover, #f5f5f5); }
  .flat-row.selected { background: var(--bg-selected, #e8f4ff); color: var(--text-selected, #0c3c66); }
  .flat-row.selected:hover { background: var(--bg-selected-hover, #d5ebff); }
  .flat-row:focus { outline: 2px solid var(--accent-color, #3498db); outline-offset: -2px; }
  .merge-bar {
    margin-top: 8px;
    padding: 10px;
    background: var(--bg-elevated, #fafafa);
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
  }
  .merge-bar h4 { margin: 0 0 4px; font-size: 0.9rem; }
  .merge-preview { list-style: none; padding: 0; margin: 6px 0; border: 1px solid var(--border-color, #eee); border-radius: 4px; background: #fff; }
  .preview-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--border-color, #eee);
    transition: background 60ms ease;
    user-select: none;
  }
  .preview-row:last-child { border-bottom: none; }
  .preview-row:hover { background: var(--bg-hover, #f5f5f5); }
  .preview-row.keep { background: var(--bg-selected, #e8f4ff); color: var(--text-selected, #0c3c66); }
  .preview-row:focus { outline: 2px solid var(--accent-color, #3498db); outline-offset: -2px; }
  .merge-action { display: flex; justify-content: flex-end; }
</style>
