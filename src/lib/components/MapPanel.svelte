<script>
  import { onMount } from 'svelte';
  import TomSelect from 'tom-select';
  import 'tom-select/dist/css/tom-select.css';
  import { people, places } from '../../db/db.js';
  import { on, SHOW_ON_MAP } from '../../state.js';
  import { addMarkers, removeMarkers, zoomToMarker, fitBounds } from '../../ui/map.js';

  let { initialPersonId = null, onconsumed } = $props();

  const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e84393'];

  let selectEl;
  let tomSelect;

  // { personId: { person, color, events: [{eventId, lat, lng, type, date, place, personName}] } }
  let selected = $state({});

  // Synchronous color map — shared between TomSelect render and addPerson
  // TomSelect's render.item fires before onItemAdd, so color must be assigned in render
  const colorMap = new Map();
  function getColor(personId) {
    if (!colorMap.has(personId)) {
      colorMap.set(personId, COLORS[colorMap.size % COLORS.length]);
    }
    return colorMap.get(personId);
  }

  // Cache place lookups to avoid repeated fetches
  const placeCache = new Map();

  async function getPlace(placeId) {
    if (placeCache.has(placeId)) return placeCache.get(placeId);
    const p = await places.get(placeId);
    placeCache.set(placeId, p);
    return p;
  }

  function formatName(person) {
    return [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  }

  function extractYear(dateStr) {
    if (!dateStr) return '';
    const m = dateStr.match(/\b(\d{4})\b/);
    return m ? m[1] : '';
  }

  async function addPerson(personId) {
    if (selected[personId]) return;

    const data = await people.getWithEvents(personId);
    if (!data) return;

    const personName = formatName(data.person);
    const color = getColor(personId);

    // Gather all events (owned + shared + participating)
    const allEvents = [
      ...(data.events || []).map(e => ({ ...e, _kind: 'owned' })),
      ...(data.sharedEvents || []).map(e => ({ ...e, _kind: 'shared' })),
      ...(data.participatingEvents || []).map(e => ({ ...e, _kind: 'participating' })),
    ];

    // Resolve place coordinates for events with place_id
    const mappedEvents = [];
    for (const ev of allEvents) {
      if (!ev.place_id) continue;
      const place = await getPlace(ev.place_id);
      if (!place || place.latitude == null || place.longitude == null) continue;

      // For participating events, show the owner's name; for shared, show other participants
      let ownerName = '';
      if (ev._kind === 'participating') {
        ownerName = ev.owner_name?.trim() || '';
      } else if (ev._kind === 'shared' && ev.participants?.length > 0) {
        const others = ev.participants.filter(p => p.person_id !== personId).map(p => p.name?.trim()).filter(Boolean);
        ownerName = others.join(', ');
      }

      mappedEvents.push({
        eventId: ev.id,
        lat: place.latitude,
        lng: place.longitude,
        type: ev.type || 'other',
        date: ev.date || '',
        place: ev.place || place.name || '',
        personName,
        ownerName,
      });
    }

    const birthYear = extractYear(allEvents.find(e => e.type === 'birth')?.date);
    const deathYear = extractYear(allEvents.find(e => e.type === 'death')?.date);
    const years = [birthYear, deathYear].filter(Boolean).join(' - ');

    selected = {
      ...selected,
      [personId]: { person: data.person, color, events: mappedEvents, years },
    };

    addMarkers(personId, color, mappedEvents);
    fitBounds();
  }

  function removePerson(personId) {
    removeMarkers(personId);
    const next = { ...selected };
    delete next[personId];
    selected = next;
    fitBounds();
  }

  function handleEventClick(personId, eventId) {
    zoomToMarker(personId, eventId);
  }

  let selectedEntries = $derived(Object.entries(selected));
  let totalMarkers = $derived(selectedEntries.reduce((sum, [, v]) => sum + v.events.length, 0));

  async function addPersonWithTag(personId) {
    if (selected[personId]) { fitBounds(); return; }
    await addPerson(personId);
    fitBounds();
  }

  // Watch for initialPersonId changes (when already mounted in map view)
  $effect(() => {
    if (initialPersonId && tomSelect) {
      addPersonWithTag(initialPersonId);
      onconsumed?.();
    }
  });

  onMount(() => {
    tomSelect = new TomSelect(selectEl, {
      valueField: 'id',
      labelField: 'label',
      searchField: ['label'],
      placeholder: 'Add person...',
      maxItems: 1,
      load(query, callback) {
        people.search(query).then(results => {
          callback(results.map(p => ({
            id: p.id,
            label: [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed',
          })));
        }).catch(() => callback());
      },
      onItemAdd(value) {
        addPerson(value);
        // Clear immediately — selected people are shown in the list below
        tomSelect.clear(true);
        tomSelect.clearOptions();
        // Dismiss mobile keyboard
        tomSelect.blur();
      },
    });

    // Handle "Show on map" from the person panel
    const offShowOnMap = on(SHOW_ON_MAP, (personId) => addPersonWithTag(personId));

    // Handle initial person passed as prop
    if (initialPersonId) {
      addPersonWithTag(initialPersonId);
      onconsumed?.();
    }

    return () => {
      offShowOnMap();
      tomSelect?.destroy();
    };
  });
</script>

<div class="map-panel">
  <div class="map-panel-picker">
    <select bind:this={selectEl}></select>
  </div>

  <div class="map-panel-list">
    {#each selectedEntries as [personId, entry]}
      <div class="map-person">
        <div class="map-person-header">
          <div class="map-person-dot" style:background={entry.color}></div>
          <span class="map-person-name">{formatName(entry.person)}</span>
          {#if entry.years}<span class="map-person-years">{entry.years}</span>{/if}
          <button class="btn-link btn-sm map-person-remove" onclick={() => removePerson(personId)}>&times;</button>
        </div>
        {#if entry.events.length === 0}
          <div class="map-no-events">No mapped events</div>
        {:else}
          {#each entry.events as ev}
            <div class="map-event-row" onclick={() => handleEventClick(personId, ev.eventId)}>
              <span>&#x1F4CD;</span>
              <span>{ev.type}{#if ev.ownerName} <span class="map-event-owner">— {ev.ownerName}</span>{/if}</span>
              {#if ev.date}<span>&middot; {ev.date}</span>{/if}
              {#if ev.place}<span>&middot; {ev.place}</span>{/if}
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>

  <div class="map-panel-footer">
    {selectedEntries.length} people &middot; {totalMarkers} markers
  </div>
</div>
