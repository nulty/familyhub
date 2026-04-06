<script>
  import { events, citations, places, relationships } from '../../db/db.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { openPlaceForm, openPersonForm, openSourceForm } from '../shared/open.js';
  import Modal from './Modal.svelte';
  import PersonPicker from '../pickers/PersonPicker.svelte';
  import PlacePicker from '../pickers/PlacePicker.svelte';
  import SourcePicker from '../pickers/SourcePicker.svelte';
  import CitationPicker from '../pickers/CitationPicker.svelte';

  const EVENT_TYPES = [
    'birth', 'death', 'marriage', 'burial', 'residence',
    'census', 'immigration', 'emigration', 'naturalisation',
    'occupation', 'divorce', 'other',
  ];

  const PARTICIPANT_ROLES = [
    'father', 'mother', 'witness', 'godfather', 'godmother',
    'informant', 'spouse', 'head', 'wife', 'son', 'daughter',
    'boarder', 'servant', 'visitor', 'resident', 'other',
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
  let eventNotes = $state('');
  let isEdit = $state(false);
  let title = $state('New Event');
  let debugPersonId = $state(personId); // debug: shows the event's person_id

  // Participants
  let participantEntries = $state([]);

  // Shared event types (no single owner, all people are participants)
  const SHARED_EVENT_TYPES = ['marriage', 'census'];
  let isShared = $derived(SHARED_EVENT_TYPES.includes(type));
  let isMarriage = $derived(type === 'marriage');
  let spouse = $state(null); // { id, given_name, surname }
  let knownPartners = $state([]);

  // Citations
  let citationEntries = $state([]);

  $effect(() => {
    // Load known partners for marriage spouse suggestion
    if (personId) {
      relationships.getFamily(personId).then(fam => {
        knownPartners = fam.partners || [];
      });
    }

    if (eventId) {
      isEdit = true;
      title = 'Edit Event';
      (async () => {
        const existing = await events.get(eventId);
        if (!existing) { onclose?.(); return; }
        debugPersonId = existing.person_id;
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
          existing: false,
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

        // For marriage: set spouse from existing participants
        if (existing.type === 'marriage') {
          const spouseEntry = existingParticipants.find(p => p.role === 'spouse' && p.person_id !== personId);
          if (spouseEntry) {
            spouse = { id: spouseEntry.person_id, given_name: spouseEntry.given_name, surname: spouseEntry.surname };
          }
        }
      })();
    }
  });

  // Place picker
  function selectPlace(p) {
    placeText = p.full_name || p.name;
    selectedPlaceId = p.id;
  }

  function clearPlace() {
    placeText = '';
    selectedPlaceId = null;
  }

  function handleNewPlace() {
    openPlaceForm(null, async (newPlace) => {
      selectedPlaceId = newPlace.id;
      const h = await places.hierarchy(newPlace.id);
      placeText = h.length > 0 ? h.map(p => p.name).reverse().join(', ') : newPlace.name;
    });
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

  // Marriage spouse
  function selectSpouse(person) {
    spouse = { id: person.id, given_name: person.given_name, surname: person.surname };
  }

  function clearSpouse() {
    spouse = null;
  }

  function createSpouse() {
    openPersonForm(null, (newPerson) => {
      selectSpouse(newPerson);
    });
  }

  // Citations
  let showCitationPicker = $state(false);

  function addCitation() {
    citationEntries = [...citationEntries, {
      source_id: null, source_title: '', detail: '', url: '', accessed: '', confidence: '', deleted: false, existing: false,
    }];
  }

  function handleExistingCitationSelect(citation) {
    showCitationPicker = false;
    // Don't add duplicates
    if (citationEntries.some(c => c.id === citation.id && !c.deleted)) return;
    citationEntries = [...citationEntries, {
      id: citation.id,
      source_id: citation.source_id,
      source_title: citation.source_title,
      detail: citation.detail || '',
      url: citation.url || '',
      accessed: citation.accessed || '',
      confidence: citation.confidence || '',
      deleted: false,
      existing: true,
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
        // If type changed to/from shared, update person_id accordingly
        if (isShared) {
          data.person_id = null;
          // Ensure current person is a participant
          const existingAsParticipant = participantEntries.some(p => p.person_id === personId && !p.removed);
          if (personId && !existingAsParticipant) {
            await events.addParticipant(eventId, personId, isMarriage ? 'spouse' : 'resident');
          }
        }
        await events.update(eventId, data);
        for (const c of citationEntries) {
          if (c.deleted && c.id && c.existing) {
            // Unlink existing citation from this event (don't delete the citation itself)
            await citations.unlinkEvent(c.id, eventId);
          } else if (c.deleted && c.id && !c.existing) {
            await citations.delete(c.id);
          } else if (c.existing && !c.deleted && c.id) {
            // Existing citation newly linked — ensure junction row exists
            await citations.linkEvent(c.id, eventId);
          } else if (c.id && !c.deleted && !c.existing && c.source_id) {
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
        // Shared events (marriage, census): no owner, all people are participants
        const ownerPersonId = isShared ? null : personId;
        const created = await events.create(ownerPersonId, data);

        if (isShared) {
          // Add current person as participant
          await events.addParticipant(created.id, personId, isMarriage ? 'spouse' : 'resident');
          if (isMarriage && spouse) {
            await events.addParticipant(created.id, spouse.id, 'spouse');
            // Auto-create partner relationship if one doesn't exist
            await relationships.addPartner(personId, spouse.id);
          }
          // Add generic participants (for census household members etc.)
          for (const p of participantEntries) {
            if (!p.removed) {
              await events.addParticipant(created.id, p.person_id, p.role);
            }
          }
        }

        for (const c of citationEntries) {
          if (c.deleted) continue;
          if (c.existing && c.id) {
            await citations.linkEvent(c.id, created.id);
          } else if (c.source_id) {
            await citations.create({ source_id: c.source_id, event_id: created.id, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
          }
        }

        if (!isShared) {
          for (const p of participantEntries) {
            if (!p.removed) {
              await events.addParticipant(created.id, p.person_id, p.role);
            }
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


<Modal {title} onclose={onclose}>
  <form onsubmit={handleSubmit}>
    <div class="form-group" style="background:#fff3cd;padding:6px 8px;border-radius:4px;font-size:12px;font-family:monospace">
      <label style="font-weight:600;margin:0">person_id: <span style="color:#666">{debugPersonId ?? 'NULL'}</span></label>
    </div>
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
    <div class="form-group">
      <label>Place</label>
      {#if selectedPlaceId}
        <div class="selected-place-row">
          <span class="selected-place-name">{placeText}</span>
          <button type="button" class="btn-link btn-sm" onclick={clearPlace}>change</button>
        </div>
      {:else}
        <PlacePicker
          onselect={selectPlace}
          oncreate={handleNewPlace}
        />
      {/if}
    </div>
    <div class="form-group">
      <label for="ef-notes">Notes</label>
      <textarea id="ef-notes" rows="2" bind:value={eventNotes}></textarea>
    </div>

    {#if isMarriage}
      <!-- Spouse picker for marriage events -->
      <div class="form-group">
        <label>Spouse</label>
        {#if spouse}
          <div class="participant-row">
            <span class="participant-name">{[spouse.given_name, spouse.surname].filter(Boolean).join(' ') || 'Unnamed'}</span>
            <button type="button" class="btn-link btn-sm" style="color:var(--danger)" onclick={clearSpouse}>change</button>
          </div>
        {:else}
          {#if knownPartners.length > 0 && !spouse}
            <div class="spouse-suggestions">
              {#each knownPartners as p}
                <button type="button" class="btn btn-sm" onclick={() => selectSpouse(p)}>
                  {[p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed'}
                </button>
              {/each}
            </div>
          {/if}
          <PersonPicker
            onselect={selectSpouse}
            excludeIds={[personId]}
            oncreate={createSpouse}
          />
        {/if}
      </div>
    {/if}

    <!-- Participants (shown for all event types) -->
    <div class="form-group">
      <label>{isMarriage ? 'Other Participants' : isShared ? 'Household Members' : 'Participants'}</label>
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
          <div class="section-empty" style="margin:4px 0">{isShared ? 'No household members added' : 'No participants'}</div>
        {/if}
      </div>
      <PersonPicker
        onselect={handleParticipantSelect}
        excludeIds={[personId, ...(spouse ? [spouse.id] : [])]}
        oncreate={handleParticipantCreate}
      />
    </div>

    <!-- Citations -->
    <div class="form-group">
      <label>Citations</label>
      <div>
        {#each citationEntries as c, idx}
          {#if !c.deleted}
            {#if c.existing}
              <div class="citation-row citation-existing">
                <div class="citation-source-row">
                  <span class="citation-source-label">{c.source_title || '(unnamed source)'}</span>
                  {#if c.detail}<span class="citation-detail-label"> — {c.detail}</span>{/if}
                </div>
                <button type="button" class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeCitation(idx)}>Remove</button>
              </div>
            {:else}
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
                  <div class="accessed-field">
                    <input type="text" placeholder="Date accessed" value={c.accessed} oninput={(e) => updateCitation(idx, 'accessed', e.target.value)}>
                    <button type="button" class="btn btn-sm" onclick={() => updateCitation(idx, 'accessed', new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }))}>Today</button>
                  </div>
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
          {/if}
        {/each}
      </div>
      {#if showCitationPicker}
        <CitationPicker
          onselect={handleExistingCitationSelect}
          excludeIds={citationEntries.filter(c => !c.deleted && c.id).map(c => c.id)}
        />
      {/if}
      <div class="citation-add-actions">
        <button type="button" class="btn btn-sm btn-link" onclick={addCitation}>+ New Citation</button>
        <button type="button" class="btn btn-sm btn-link" onclick={() => showCitationPicker = !showCitationPicker}>
          {showCitationPicker ? 'Cancel' : '+ Link Existing'}
        </button>
      </div>
    </div>

    <div class="form-actions">
      <button type="button" class="btn" onclick={() => onclose?.()}>Cancel</button>
      <button type="submit" class="btn btn-primary">{isEdit ? 'Save' : 'Create'}</button>
    </div>
  </form>
</Modal>
