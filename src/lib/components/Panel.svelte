<script>
  import { people, relationships, events as eventsApi } from '../../db/db.js';
  import { emit, PERSON_DESELECTED, PERSON_SELECTED, DATA_CHANGED } from '../../state.js';
  import { openPersonForm, openEventForm, openRelationshipForm } from '../shared/open.js';
  import { focusPerson } from '../../ui/tree.js';
  import { showToast } from '../shared/toast-store.js';
  import { getConfig, setConfig } from '../../config.js';

  let { personId } = $props();

  let person = $state(null);
  let events = $state([]);
  let participatingEvents = $state([]);
  let parents = $state([]);
  let children = $state([]);
  let partners = $state([]);
  let birth = $derived(events.find(e => e.type === 'birth'));
  let death = $derived(events.find(e => e.type === 'death'));
  let isRoot = $derived(person && person.id === getConfig('rootPerson'));

  let uniquePlaces = $derived.by(() => {
    const placeEntries = [];
    for (const ev of events) {
      if (ev.place) placeEntries.push({ place: ev.place, date: ev.date, sort_date: ev.sort_date, type: ev.type, via: null });
    }
    for (const ev of participatingEvents) {
      if (ev.place) placeEntries.push({ place: ev.place, date: ev.date, sort_date: ev.sort_date, type: ev.type, via: ev.owner_name });
    }
    const placeMap = {};
    for (const e of placeEntries) {
      const key = `${e.place}::${e.type}`;
      if (!placeMap[key]) placeMap[key] = e;
    }
    return Object.values(placeMap).sort((a, b) => (a.sort_date ?? Infinity) - (b.sort_date ?? Infinity));
  });

  let fullName = $derived(person ? ([person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed') : '');
  let genderLabel = $derived(person ? ({ M: 'Male', F: 'Female', U: 'Unknown' }[person.gender] || 'Unknown') : '');

  $effect(() => {
    if (personId) loadPerson(personId);
  });

  async function loadPerson(id) {
    const result = await people.getWithEvents(id);
    if (!result) { person = null; return; }
    person = result.person;
    events = result.events;
    participatingEvents = result.participatingEvents;
    parents = result.parents;
    children = result.children;
    partners = result.partners;
  }

  function close() { emit(PERSON_DESELECTED); }

  function navigate(id) {
    focusPerson(id);
    emit(PERSON_SELECTED, id);
  }

  function setRoot() {
    setConfig('rootPerson', person.id);
    showToast(`${fullName} set as root person`);
  }

  async function deletePerson() {
    if (!confirm(`Delete ${fullName}? This will remove all their events and relationships.`)) return;
    await people.delete(person.id);
    emit(PERSON_DESELECTED);
    emit(DATA_CHANGED);
    showToast(`Deleted ${fullName}`);
  }

  async function deleteEvent(eventId) {
    if (!confirm('Delete this event?')) return;
    await eventsApi.delete(eventId);
    emit(DATA_CHANGED);
    showToast('Event deleted');
  }

  async function removeRelationship(relId) {
    if (!confirm('Remove this relationship?')) return;
    await relationships.remove(relId);
    emit(DATA_CHANGED);
    showToast('Relationship removed');
  }

  function formatName(p) {
    return [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  }

  function linkify(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }
</script>

{#if person}
  <div class="panel-header">
    <h2>{fullName}</h2>
    <span class="gender-badge {person.gender}">{genderLabel}</span>
    <button class="panel-close" onclick={close}>&times;</button>
  </div>

  <div class="panel-actions">
    <button class="btn btn-sm" onclick={() => openPersonForm(person.id)}>Edit</button>
    <button class="btn btn-sm" onclick={setRoot}>{isRoot ? 'Root person' : 'Set as root'}</button>
    <button class="btn btn-sm btn-danger" onclick={deletePerson}>Delete</button>
  </div>

  {#if birth || death}
    <div class="panel-vitals">
      {#if birth}<div>Born: <span>{birth.date || ''}{birth.place ? ' — ' + birth.place : ''}</span></div>{/if}
      {#if death}<div>Died: <span>{death.date || ''}{death.place ? ' — ' + death.place : ''}</span></div>{/if}
    </div>
  {/if}

  {#if person.notes}
    <div class="panel-vitals"><div style="white-space:pre-wrap">{@html linkify(person.notes)}</div></div>
  {/if}

  {#if uniquePlaces.length > 0}
    <details class="panel-section" open>
      <summary>Places ({uniquePlaces.length})</summary>
      <div class="panel-places">
        {#each uniquePlaces as p}
          <div class="place-entry">
            <span class="place-entry-name">{p.place}</span>
            <span class="place-entry-detail">{p.type}{p.date ? ' — ' + p.date : ''}{p.via ? ' (via ' + p.via + ')' : ''}</span>
          </div>
        {/each}
      </div>
    </details>
  {/if}

  <details class="panel-section" open>
    <summary>Events ({events.length})</summary>
    <div class="panel-events">
      {#if events.length === 0}
        <div class="section-empty">No events</div>
      {:else}
        {#each events as ev}
          <div class="event-item">
            <div class="event-item-header">
              <span class="event-type">{ev.type}</span>
              {#if ev.date}<span class="event-date">{ev.date}</span>{/if}
              <span class="event-actions">
                <button class="btn-link btn-sm" onclick={() => openEventForm(person.id, ev.id)}>edit</button>
                <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => deleteEvent(ev.id)}>delete</button>
              </span>
            </div>
            {#if ev.place}<div class="event-place">{ev.place}</div>{/if}
            {#if ev.notes}<div class="event-notes">{@html linkify(ev.notes)}</div>{/if}
            {#if ev.citations?.some(c => c.source_title || c.url)}
              <div class="event-sources">
                {#each ev.citations.filter(c => c.source_title || c.url) as c}
                  <div>
                    {#if c.url || c.source_url}
                      <a href={c.url || c.source_url} target="_blank" rel="noopener">{c.source_title + (c.detail ? `, ${c.detail}` : '') || c.url || c.source_url}</a>
                    {:else}
                      {c.source_title}{c.detail ? `, ${c.detail}` : ''}
                    {/if}
                    {#if c.repository_name}<span class="citation-repo">({c.repository_name})</span>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openEventForm(person.id)}>+ Add Event</button>
    </div>
  </details>

  {#if participatingEvents.length > 0}
    <details class="panel-section">
      <summary>Participating Events ({participatingEvents.length})</summary>
      <div class="panel-events">
        {#each participatingEvents as ev}
          <div class="event-item">
            <div class="event-item-header">
              <span class="event-type">{ev.type}</span>
              {#if ev.date}<span class="event-date">{ev.date}</span>{/if}
            </div>
            {#if ev.place}<div class="event-place">{ev.place}</div>{/if}
            <div class="event-participant-info">
              Role: {ev.participant_role || 'participant'} &middot;
              Owner: <a href="#" onclick={(e) => { e.preventDefault(); navigate(ev.owner_id); }}>{ev.owner_name}</a>
            </div>
          </div>
        {/each}
      </div>
    </details>
  {/if}

  <details class="panel-section" open>
    <summary>Parents ({parents.length})</summary>
    <div class="panel-rels">
      {#if parents.length === 0}<div class="section-empty">No parents</div>{/if}
      {#each parents as p}
        <div class="rel-item">
          <span class="rel-item-name" onclick={() => navigate(p.id)}>{formatName(p)}</span>
          <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeRelationship(p.rel_id)}>remove</button>
        </div>
      {/each}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'parent')}>+ Add Parent</button>
    </div>
  </details>

  <details class="panel-section" open>
    <summary>Partners ({partners.length})</summary>
    <div class="panel-rels">
      {#if partners.length === 0}<div class="section-empty">No partners</div>{/if}
      {#each partners as p}
        <div class="rel-item">
          <span class="rel-item-name" onclick={() => navigate(p.id)}>{formatName(p)}</span>
          <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeRelationship(p.rel_id)}>remove</button>
        </div>
      {/each}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'partner')}>+ Add Partner</button>
    </div>
  </details>

  <details class="panel-section" open>
    <summary>Children ({children.length})</summary>
    <div class="panel-rels">
      {#if children.length === 0}<div class="section-empty">No children</div>{/if}
      {#each children as p}
        <div class="rel-item">
          <span class="rel-item-name" onclick={() => navigate(p.id)}>{formatName(p)}</span>
          <button class="btn-link btn-sm" style="color:var(--danger)" onclick={() => removeRelationship(p.rel_id)}>remove</button>
        </div>
      {/each}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'child')}>+ Add Child</button>
    </div>
  </details>
{:else}
  <p style="padding:16px;color:var(--text-muted)">Person not found.</p>
{/if}
