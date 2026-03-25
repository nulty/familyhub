<script>
  import { events, citations, places } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openPlaceForm } from '../../forms/place-form.js';
  import { openPersonForm } from '../../forms/person-form.js';
  import { openSourceForm } from '../../forms/source-form.js';
  import Modal from './Modal.svelte';
  import PersonPicker from '../pickers/PersonPicker.svelte';
  import SourcePicker from '../pickers/SourcePicker.svelte';

  const EVENT_TYPES = [
    'birth', 'death', 'marriage', 'burial', 'residence',
    'census', 'immigration', 'emigration', 'naturalisation',
    'occupation', 'divorce', 'other',
  ];

  const PARTICIPANT_ROLES = [
    'father', 'mother', 'witness', 'godfather', 'godmother',
    'informant', 'spouse', 'other',
  ];

  const CONFIDENCE_OPTIONS = [
    { value: '', label: '(unspecified)' },
    { value: 'primary', label: 'Primary' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'questionable', label: 'Questionable' },
  ];

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  let { personId, eventId = null, onclose } = $props();

  let type = $state('birth');
  let date = $state('');
  let placeText = $state('');
  let selectedPlaceId = $state(null);
  let placeSuggestions = $state([]);
  let placeOpen = $state(false);
  let eventNotes = $state('');
  let isEdit = $state(false);
  let title = $state('New Event');
  let placeTimer = null;
  let placeInputEl;

  // Participants
  let participantEntries = $state([]);

  // Citations
  let citationEntries = $state([]);

  $effect(() => {
    if (eventId) {
      isEdit = true;
      title = 'Edit Event';
      (async () => {
        const eventList = await events.list(personId);
        const existing = eventList.find(e => e.id === eventId);
        if (!existing) { onclose?.(); return; }
        type = existing.type || 'birth';
        date = existing.date || '';
        placeText = existing.place || '';
        selectedPlaceId = existing.place_id || null;
        eventNotes = existing.notes || '';

        const existingCitations = await citations.listForEvent(eventId);
        citationEntries = existingCitations.map(c => ({
          id: c.id,
          source_id: c.source_id,
          source_title: c.source_title,
          detail: c.detail || '',
          url: c.url || '',
          accessed: c.accessed || '',
          confidence: c.confidence || '',
          deleted: false,
        }));

        const existingParticipants = await events.getParticipants(eventId);
        participantEntries = existingParticipants.map(p => ({
          person_id: p.person_id,
          given_name: p.given_name,
          surname: p.surname,
          role: p.role,
          isNew: false,
          removed: false,
        }));
      })();
    }
  });

  // Place autocomplete
  function handlePlaceInput(e) {
    placeText = e.target.value;
    selectedPlaceId = null;
    clearTimeout(placeTimer);
    if (!placeText.trim()) { placeSuggestions = []; placeOpen = false; return; }
    placeTimer = setTimeout(async () => {
      placeSuggestions = await places.search(placeText.trim());
      placeOpen = true;
    }, 200);
  }

  function selectPlace(p) {
    placeText = p.full_name || p.name;
    selectedPlaceId = p.id;
    placeOpen = false;
  }

  function handleNewPlace() {
    openPlaceForm(null, async (newPlace) => {
      placeText = newPlace.name;
      selectedPlaceId = newPlace.id;
      const h = await places.hierarchy(newPlace.id);
      if (h.length > 0) placeText = h.map(p => p.name).reverse().join(', ');
    });
  }

  function handlePlaceClickOutside(e) {
    if (placeInputEl && !placeInputEl.parentElement.contains(e.target)) {
      placeOpen = false;
    }
  }

  // Participants
  function handleParticipantSelect(person) {
    if (participantEntries.some(e => e.person_id === person.id && !e.removed)) return;
    participantEntries = [...participantEntries, {
      person_id: person.id,
      given_name: person.given_name,
      surname: person.surname,
      role: 'witness',
      isNew: true,
      removed: false,
    }];
  }

  function handleParticipantCreate() {
    openPersonForm(null, (newPerson) => {
      handleParticipantSelect(newPerson);
    });
  }

  function removeParticipant(idx) {
    participantEntries = participantEntries.map((p, i) =>
      i === idx ? { ...p, removed: true } : p
    );
  }

  function updateParticipantRole(idx, role) {
    participantEntries = participantEntries.map((p, i) =>
      i === idx ? { ...p, role } : p
    );
  }

  // Citations
  function addCitation() {
    citationEntries = [...citationEntries, {
      source_id: null, source_title: '', detail: '', url: '', accessed: '', confidence: '', deleted: false,
    }];
  }

  function removeCitation(idx) {
    citationEntries = citationEntries.map((c, i) =>
      i === idx ? { ...c, deleted: true } : c
    );
  }

  function handleCitationSourceSelect(idx, source) {
    citationEntries = citationEntries.map((c, i) =>
      i === idx ? { ...c, source_id: source.id, source_title: source.title } : c
    );
  }

  function handleCitationSourceCreate(idx) {
    openSourceForm(null, (newSource) => {
      handleCitationSourceSelect(idx, newSource);
    });
  }

  function changeCitationSource(idx) {
    citationEntries = citationEntries.map((c, i) =>
      i === idx ? { ...c, source_id: null, source_title: '' } : c
    );
  }

  function updateCitation(idx, field, value) {
    citationEntries = citationEntries.map((c, i) =>
      i === idx ? { ...c, [field]: value } : c
    );
  }

  // Submit
  async function handleSubmit(e) {
    e.preventDefault();
    const data = {
      type,
      date: date.trim(),
      place: placeText.trim(),
      place_id: selectedPlaceId,
      notes: eventNotes.trim(),
    };

    try {
      if (isEdit) {
        await events.update(eventId, data);
        for (const c of citationEntries) {
          if (c.deleted && c.id) {
            await citations.delete(c.id);
          } else if (c.id && !c.deleted && c.source_id) {
            await citations.update(c.id, { source_id: c.source_id, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
          } else if (!c.id && !c.deleted && c.source_id) {
            await citations.create({ source_id: c.source_id, event_id: eventId, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
          }
        }
        for (const p of participantEntries) {
          if (p.removed && !p.isNew) {
            await events.removeParticipant(eventId, p.person_id);
          } else if (p.isNew && !p.removed) {
            await events.addParticipant(eventId, p.person_id, p.role);
          } else if (!p.isNew && !p.removed) {
            await events.updateParticipantRole(eventId, p.person_id, p.role);
          }
        }
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Event updated');
      } else {
        const created = await events.create(personId, data);
        for (const c of citationEntries) {
          if (!c.deleted && c.source_id) {
            await citations.create({ source_id: c.source_id, event_id: created.id, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
          }
        }
        for (const p of participantEntries) {
          if (!p.removed) {
            await events.addParticipant(created.id, p.person_id, p.role);
          }
        }
        onclose?.();
        emit(DATA_CHANGED);
        showToast('Event created');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }
</script>

<svelte:document onclick={handlePlaceClickOutside} />

<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <div class="form-group">
      <label for="ef-type">Type</label>
      <select id="ef-type" bind:value={type}>
        {#each EVENT_TYPES as t}
          <option value={t}>{capitalize(t)}</option>
        {/each}
      </select>
    </div>
    <div class="form-group">
      <label for="ef-date">Date</label>
      <input id="ef-date" type="text" bind:value={date} placeholder="e.g. 3 SEP 1913, ABT 1890" autocomplete="off">
      <span class="form-hint">Free text — e.g. "1901", "BET 1889 AND 1890", "ABT MAR 1920"</span>
    </div>
    <div class="form-group" style="position:relative">
      <label for="ef-place">Place</label>
      <input
        bind:this={placeInputEl}
        id="ef-place"
        type="text"
        value={placeText}
        oninput={handlePlaceInput}
        autocomplete="off"
      >
      {#if placeOpen && placeSuggestions.length > 0}
        <div class="place-suggestions" style="display:block">
          {#each placeSuggestions as p}
            <div class="place-suggestion" onclick={() => selectPlace(p)}>
              {(p.full_name || p.name) + (p.type ? ` (${p.type})` : '')}
            </div>
          {/each}
        </div>
      {/if}
      <button type="button" class="btn btn-sm btn-link" onclick={handleNewPlace}>+ New place</button>
    </div>
    <div class="form-group">
      <label for="ef-notes">Notes</label>
      <textarea id="ef-notes" rows="2" bind:value={eventNotes}></textarea>
    </div>

    <!-- Participants -->
    <div class="form-group">
      <label>Participants</label>
      <div>
        {#each participantEntries as entry, idx}
          {#if !entry.removed}
            <div class="participant-row">
              <span class="participant-name">{[entry.given_name, entry.surname].filter(Boolean).join(' ') || 'Unnamed'}</span>
              <select class="participant-role" value={entry.role} onchange={(e) => updateParticipantRole(idx, e.target.value)}>
                {#each PARTICIPANT_ROLES as r}
                  <option value={r}>{capitalize(r)}</option>
                {/each}
              </select>
              <button type="button" class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeParticipant(idx)}>Remove</button>
            </div>
          {/if}
        {/each}
        {#if participantEntries.filter(e => !e.removed).length === 0}
          <div class="section-empty" style="margin:4px 0">No participants</div>
        {/if}
      </div>
      <PersonPicker
        onselect={handleParticipantSelect}
        excludeIds={[personId]}
        oncreate={handleParticipantCreate}
      />
    </div>

    <!-- Citations -->
    <div class="form-group">
      <label>Citations</label>
      <div>
        {#each citationEntries as c, idx}
          {#if !c.deleted}
            <div class="citation-row">
              <div class="citation-source-row">
                {#if c.source_id}
                  <span class="citation-source-label">{c.source_title || '(unnamed source)'}</span>
                  <button type="button" class="btn-link btn-sm" onclick={() => changeCitationSource(idx)}>change</button>
                {:else}
                  <SourcePicker
                    onselect={(source) => handleCitationSourceSelect(idx, source)}
                    oncreate={() => handleCitationSourceCreate(idx)}
                  />
                {/if}
              </div>
              <div class="citation-details-row">
                <input type="text" placeholder="Detail (page, entry, volume...)" value={c.detail} oninput={(e) => updateCitation(idx, 'detail', e.target.value)}>
                <input type="text" placeholder="Direct URL to record" value={c.url} oninput={(e) => updateCitation(idx, 'url', e.target.value)}>
                <input type="text" placeholder="Date accessed" value={c.accessed} oninput={(e) => updateCitation(idx, 'accessed', e.target.value)}>
                <select value={c.confidence} onchange={(e) => updateCitation(idx, 'confidence', e.target.value)}>
                  {#each CONFIDENCE_OPTIONS as o}
                    <option value={o.value}>{o.label}</option>
                  {/each}
                </select>
                <div class="citation-details-actions">
                  <button type="button" class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeCitation(idx)}>Remove</button>
                </div>
              </div>
            </div>
          {/if}
        {/each}
      </div>
      <button type="button" class="btn btn-sm btn-link" onclick={addCitation}>+ Add Citation</button>
    </div>

    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
