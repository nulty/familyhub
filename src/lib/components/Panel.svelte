<script>
  import { people, relationships, events as eventsApi, personNames } from '../../db/db.js';
  import { emit, PERSON_DESELECTED, PERSON_SELECTED, DATA_CHANGED } from '../../state.js';
  import { openPersonForm, openEventForm, openRelationshipForm, openCitationForm } from '../shared/open.js';
  import { focusPerson } from '../../ui/tree.js';
  import { showToast } from '../shared/toast-store.js';
  import { getConfig, setConfig } from '../../config.js';

  let { personId, onEditChange } = $props();

  let person = $state(null);
  let names = $state([]);
  let events = $state([]);
  let sharedEvents = $state([]);
  let participatingEvents = $state([]);
  let parents = $state([]);
  let children = $state([]);
  let partners = $state([]);
  let editing = $state(false);

  let allEvents = $derived.by(() => {
    const shared = sharedEvents.map(e => ({ ...e, _shared: true }));
    return [...events, ...shared].sort((a, b) =>
      (a.sort_date ?? Infinity) - (b.sort_date ?? Infinity)
    );
  });

  let birth = $derived(allEvents.find(e => e.type === 'birth'));
  let death = $derived(allEvents.find(e => e.type === 'death'));

  let lifeYears = $derived.by(() => {
    const b = birth?.date?.match(/\d{4}/)?.[0];
    const d = death?.date?.match(/\d{4}/)?.[0];
    if (!b && !d) return '';
    let s = `${b || '?'} - ${d || ''}`;
    if (b && d) {
      const age = parseInt(d) - parseInt(b);
      if (age > 0) s += ` (aged ~${age})`;
    }
    return s;
  });

  let fullName = $derived(person ? ([person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed') : '');

  let familyGroups = $derived.by(() => {
    const groups = [];
    const assigned = new Set();
    for (const partner of partners) {
      const partnerChildren = children.filter(c => c.other_parent_id === partner.id);
      groups.push({ partner, children: partnerChildren });
      for (const c of partnerChildren) assigned.add(c.id);
    }
    const unassigned = children.filter(c => !assigned.has(c.id));
    if (unassigned.length > 0) {
      groups.push({ partner: null, children: unassigned });
    }
    return groups;
  });

  $effect(() => {
    if (personId) loadPerson(personId);
  });

  $effect(() => {
    onEditChange?.(editing);
  });

  async function loadPerson(id) {
    const result = await people.getWithEvents(id);
    if (!result) { person = null; return; }
    person = result.person;
    names = result.names || [];
    events = result.events;
    sharedEvents = result.sharedEvents || [];
    participatingEvents = result.participatingEvents;
    parents = result.parents;
    children = result.children;
    partners = result.partners;
  }

  function close() {
    editing = false;
    emit(PERSON_DESELECTED);
  }

  function toggleEdit() {
    editing = !editing;
  }

  function navigate(id) {
    if (editing) return;
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
    editing = false;
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

  async function deleteName(nameId) {
    await personNames.delete(nameId);
    emit(DATA_CHANGED);
    showToast('Name removed');
  }

  function formatName(p) {
    return [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  }

  function formatLifeDates(p) {
    const b = p.birth_year;
    const d = p.death_year;
    if (!b && !d) return '';
    return `${b || '?'}-${d || ''}`;
  }

  function linkify(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  }

  function hasCitations(ev) {
    return ev.citations?.some(c => c.source_title || c.url);
  }
</script>

{#if person}
  <div class="panel-header">
    <div class="panel-header-top">
      <div>
        <div class="panel-name"><span class="gender-dot {person.gender}"></span>{fullName}</div>
        {#if lifeYears}<div class="panel-life-dates">{lifeYears}</div>{/if}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="panel-edit-toggle" class:active={editing} onclick={toggleEdit}>{editing ? 'Done' : 'Edit'}</button>
        {#if !editing}<button class="panel-close" onclick={close}>&times;</button>{/if}
      </div>
    </div>
  </div>

  {#if names.length > 0 || editing}
    <div class="panel-alt-names">
      {#each names as n}
        <span class="alt-name-pill">
          <span class="alt-name-type">{n.type || 'name'}</span>
          {[n.given_name, n.surname].filter(Boolean).join(' ')}
          {#if editing}<button class="alt-name-remove" onclick={() => deleteName(n.id)}>&times;</button>{/if}
        </span>
      {/each}
      {#if editing}
        <button class="btn btn-sm btn-link" onclick={() => openPersonForm(person.id)}>+ Add Name</button>
      {/if}
    </div>
  {/if}

  <div class="panel-section-title">Events{#if allEvents.length > 0} ({allEvents.length}){/if}</div>
  <div class="panel-events-list">
    {#if allEvents.length === 0}
      <div class="section-empty">No events recorded</div>
    {/if}
    {#each allEvents as ev}
      <div class="ev-card {ev.type}">
        <div class="ev-card-icon {ev.type}">&#9679;</div>
        <div class="ev-card-body">
          <div class="ev-card-top">
            <span class="ev-card-type">{ev.type}</span>
            {#if ev.date}<span class="ev-card-date">{ev.date}</span>{/if}
          </div>
          {#if ev.type === 'occupation' && ev.notes}
            <div class="ev-card-detail">{ev.notes}</div>
          {/if}
          {#if ev.place}<div class="ev-card-place">{ev.place}</div>{/if}
          {#if ev._shared && ev.participants?.length > 0}
            <div class="ev-card-participants">
              with {#each ev.participants.filter(p => p.person_id !== person.id) as p, i}{#if i > 0}, {/if}<span onclick={() => navigate(p.person_id)}>{p.name?.trim() || 'Unnamed'}</span>{/each}
            </div>
          {/if}
          {#if ev.type !== 'occupation' && ev.notes}
            <div class="ev-card-detail" style="font-style:italic">{ev.notes}</div>
          {/if}
          {#if hasCitations(ev)}
            <div class="ev-card-citation">
              {#each ev.citations.filter(c => c.source_title || c.url) as c, i}
                {#if i > 0}; {/if}
                {#if c.url || c.source_url}
                  <a href={c.url || c.source_url} target="_blank" rel="noopener">{c.source_title}{c.detail ? `, ${c.detail}` : ''}</a>
                {:else}
                  {c.source_title}{c.detail ? `, ${c.detail}` : ''}
                {/if}
              {/each}
            </div>
          {/if}
          {#if editing}
            {#if !ev.date}
              <div class="ev-card-gap" onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>+ add date</div>
            {/if}
            {#if !ev.place}
              <div class="ev-card-gap" onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>+ add place</div>
            {/if}
            {#if !hasCitations(ev)}
              <div class="ev-card-gap" onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>+ add citation</div>
            {/if}
            <div class="ev-card-actions">
              <button onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>edit</button>
              <button class="danger" onclick={() => deleteEvent(ev.id)}>delete</button>
            </div>
          {/if}
        </div>
      </div>
    {/each}
    {#if editing}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openEventForm(person.id)}>+ Add Event</button>
    {/if}
  </div>

  <div class="panel-section-title">Family</div>
  <div class="panel-family">
    {#if parents.length > 0 || editing}
      <div class="family-group">
        <div class="family-group-label">Parents</div>
        {#each parents as p}
          <span class="family-chip" onclick={() => navigate(p.id)}>
            <span class="gender-dot {p.gender}"></span>
            {formatName(p)}
            {#if formatLifeDates(p)}<span class="family-chip-dates">{formatLifeDates(p)}</span>{/if}
            {#if editing}<button class="family-chip-remove" onclick={(e) => { e.stopPropagation(); removeRelationship(p.rel_id); }}>&times;</button>{/if}
          </span>
        {/each}
        {#if editing}
          <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'parent')}>+ Add Parent</button>
        {/if}
      </div>
    {/if}

    {#each familyGroups as group}
      <div class="family-group">
        {#if group.partner}
          <div class="family-group-with">
            With
            <span class="family-chip" onclick={() => navigate(group.partner.id)}>
              <span class="gender-dot {group.partner.gender}"></span>
              {formatName(group.partner)}
              {#if formatLifeDates(group.partner)}<span class="family-chip-dates">{formatLifeDates(group.partner)}</span>{/if}
              {#if editing}<button class="family-chip-remove" onclick={(e) => { e.stopPropagation(); removeRelationship(group.partner.rel_id); }}>&times;</button>{/if}
            </span>
          </div>
        {:else if familyGroups.length > 1}
          <div class="family-group-with">Other Children</div>
        {/if}
        <div class="family-children">
          {#each group.children as c}
            <span class="family-chip" onclick={() => navigate(c.id)}>
              <span class="gender-dot {c.gender}"></span>
              {formatName(c)}
              {#if formatLifeDates(c)}<span class="family-chip-dates">{formatLifeDates(c)}</span>{/if}
              {#if editing}<button class="family-chip-remove" onclick={(e) => { e.stopPropagation(); removeRelationship(c.rel_id); }}>&times;</button>{/if}
            </span>
          {/each}
        </div>
      </div>
    {/each}

    {#if partners.length === 0 && editing}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'partner')}>+ Add Partner</button>
    {/if}
    {#if editing}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'child')}>+ Add Child</button>
    {/if}
  </div>

  {#if participatingEvents.length > 0}
    <div class="panel-section-title">Participating Events ({participatingEvents.length})</div>
    <div class="panel-participating">
      {#each participatingEvents as ev}
        <div class="participating-item">
          <span class="participating-type">{ev.type}</span>
          {#if ev.date} {ev.date}{/if}
          <span class="participating-role">({ev.participant_role || 'participant'})</span>
          on <span class="participating-owner" onclick={() => navigate(ev.owner_id)}>{ev.owner_name}</span>
        </div>
      {/each}
    </div>
  {/if}

  {#if person.notes || editing}
    <div class="panel-section-title">Notes</div>
    <div class="panel-notes">
      {#if person.notes}
        <div style="white-space:pre-wrap">{@html linkify(person.notes)}</div>
      {:else}
        <div class="section-empty">No notes</div>
      {/if}
      {#if editing}
        <button class="btn btn-sm btn-link section-add-btn" onclick={() => openPersonForm(person.id)}>Edit Person</button>
      {/if}
    </div>
  {/if}

  {#if editing}
    <div style="padding: 8px 20px 20px; border-top: 1px solid var(--border);">
      <button class="btn btn-sm" onclick={setRoot}>Set as root</button>
      <button class="btn btn-sm btn-danger" onclick={deletePerson}>Delete Person</button>
    </div>
  {/if}
{:else}
  <p style="padding:16px;color:var(--text-muted)">Person not found.</p>
{/if}
