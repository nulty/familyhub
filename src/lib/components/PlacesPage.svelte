<script>
  import { places } from '../../db/db.js';
  import { emit, PERSON_SELECTED, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openPlaceForm } from '../../forms/place-form.js';
  import { openOrganizeWizard } from '../../ui/places-organize.js';
  import { focusPerson } from '../../ui/tree.js';
  import Modal from '../forms/Modal.svelte';

  let { onclose } = $props();

  let allPlaces = $state([]);
  let byParent = $state({});
  let expandedEvents = $state({});
  let collapsed = $state({});

  $effect(() => { loadData(); });

  async function loadData() {
    allPlaces = await places.tree();
    const map = {};
    for (const p of allPlaces) {
      const key = p.parent_id || '__root__';
      if (!map[key]) map[key] = [];
      map[key].push(p);
    }
    byParent = map;
  }

  function getChildren(parentKey) {
    return byParent[parentKey] || [];
  }

  function hasChildren(placeId) {
    return (byParent[placeId]?.length || 0) > 0;
  }

  function toggleCollapse(placeId) {
    collapsed = { ...collapsed, [placeId]: !collapsed[placeId] };
  }

  async function toggleEvents(placeId) {
    if (expandedEvents[placeId]) {
      expandedEvents = { ...expandedEvents, [placeId]: null };
    } else {
      const list = await places.events(placeId);
      expandedEvents = { ...expandedEvents, [placeId]: list };
    }
  }

  function navigateToPerson(personId) {
    focusPerson(personId);
    emit(PERSON_SELECTED, personId);
    onclose?.();
  }

  async function deletePlace(place) {
    if (!confirm(`Delete "${place.name}"? Children will become root places.`)) return;
    await places.delete(place.id);
    emit(DATA_CHANGED);
    showToast(`Deleted ${place.name}`);
    await loadData();
  }

  async function handleExport() {
    const all = await places.list();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'places.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Places exported');
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) { showToast('Invalid format — expected an array'); return; }
        const idMap = {};
        const sorted = [];
        const remaining = [...data];
        while (remaining.length > 0) {
          const batch = remaining.filter(p => !p.parent_id || idMap[p.parent_id]);
          if (batch.length === 0) { sorted.push(...remaining); break; }
          sorted.push(...batch);
          for (const p of batch) remaining.splice(remaining.indexOf(p), 1);
        }
        let count = 0;
        let skipped = 0;
        for (const p of sorted) {
          try {
            const newParentId = p.parent_id ? (idMap[p.parent_id] || null) : null;
            const match = await places.findByNameTypeParent(p.name, p.type || '', newParentId);
            if (match) { idMap[p.id] = match.id; skipped++; continue; }
            const created = await places.create({ name: p.name, type: p.type || '', parent_id: newParentId, notes: p.notes || '' });
            idMap[p.id] = created.id;
            count++;
          } catch { /* skip errors */ }
        }
        emit(DATA_CHANGED);
        showToast(`Imported ${count} places${skipped ? `, ${skipped} already existed` : ''}`);
        await loadData();
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    };
    input.click();
  }

  function formatName(p) {
    return [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  }
</script>

<Modal title="Places" wide={true} onclose={onclose}>
  <div class="places-page">
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <button class="btn btn-primary btn-sm" onclick={() => openPlaceForm(null, () => loadData())}>+ Add Place</button>
      <button class="btn btn-sm" onclick={() => openOrganizeWizard(() => loadData())}>Organize</button>
      <button class="btn btn-sm" onclick={handleExport}>Export</button>
      <button class="btn btn-sm" onclick={handleImport}>Import</button>
    </div>

    {#if allPlaces.length === 0}
      <p class="section-empty">No places yet. Add one or import a GEDCOM file.</p>
    {:else}
      {#snippet placeTree(parentKey)}
        <ul class="place-tree">
          {#each getChildren(parentKey) as place}
            <li class="place-tree-item">
              <div class="place-tree-row">
                {#if hasChildren(place.id)}
                  <span class="place-toggle" onclick={() => toggleCollapse(place.id)}>
                    {collapsed[place.id] ? '\u25B6' : '\u25BC'}
                  </span>
                {:else}
                  <span class="place-toggle-spacer"></span>
                {/if}
                <span class="place-tree-name">{place.name}</span>
                {#if place.type}<span class="place-type-badge">{place.type}</span>{/if}
                <button class="btn-link btn-sm place-events-toggle" onclick={(e) => { e.stopPropagation(); toggleEvents(place.id); }}>events</button>
                <span class="place-tree-actions">
                  <button class="btn-link btn-sm" onclick={(e) => { e.stopPropagation(); openPlaceForm(place.id, () => loadData()); }}>edit</button>
                  <button class="btn-link btn-sm" style="color:var(--danger)" onclick={(e) => { e.stopPropagation(); deletePlace(place); }}>delete</button>
                </span>
              </div>
              {#if expandedEvents[place.id]}
                <div class="place-events-list">
                  {#if expandedEvents[place.id].length === 0}
                    <div class="section-empty" style="padding:4px 0">No linked events</div>
                  {:else}
                    {#each expandedEvents[place.id] as ev}
                      <div class="place-event-row">
                        <span class="place-event-type">{ev.type}</span>
                        {#if ev.date}<span class="place-event-date">{ev.date}</span>{/if}
                        <a href="#" class="place-event-person" onclick={(e) => { e.preventDefault(); navigateToPerson(ev.person_id); }}>{formatName(ev)}</a>
                      </div>
                    {/each}
                  {/if}
                </div>
              {/if}
              {#if hasChildren(place.id) && !collapsed[place.id]}
                {@render placeTree(place.id)}
              {/if}
            </li>
          {/each}
        </ul>
      {/snippet}

      {@render placeTree('__root__')}
    {/if}
  </div>
</Modal>
