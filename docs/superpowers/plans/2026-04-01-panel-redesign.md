# Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the person context panel with compact event cards, browse/edit mode toggle, and children grouped by partner.

**Architecture:** Panel.svelte gets a complete template rewrite with two rendering modes controlled by an `editing` state. The `getFamily` handler gains birth/death year subqueries and other-parent info for each child. App.svelte suppresses PERSON_SELECTED when the panel is in edit mode.

**Tech Stack:** Svelte 5 (runes: $state, $derived, $props), SQLite via handlers.js, existing CSS in styles.css

---

### Task 1: Update getFamily handler with birth/death years and other-parent

**Files:**
- Modify: `src/db/handlers.js:260-281` (getFamily)
- Modify: `tests/db-handlers.test.js` (add test)

- [ ] **Step 1: Write the failing test**

Add to `tests/db-handlers.test.js` inside the existing `describe('Relationships', ...)` block, after the last test:

```javascript
it('getFamily returns birth_year, death_year, and other_parent_id for children', () => {
  h.createPerson({ id: 'P1', given_name: 'John', gender: 'M' });
  h.createPerson({ id: 'P2', given_name: 'Mary', gender: 'F' });
  h.createPerson({ id: 'P3', given_name: 'Tom', gender: 'M' });
  h.addPartner('R1', 'P1', 'P2');
  h.addParentChild('R2', 'P1', 'P3');
  h.addParentChild('R3', 'P2', 'P3');
  h.createEvent({ id: 'E1', person_id: 'P2', type: 'birth', date: '1895' });
  h.createEvent({ id: 'E2', person_id: 'P2', type: 'death', date: '1960' });
  h.createEvent({ id: 'E3', person_id: 'P3', type: 'birth', date: '1921' });

  const family = h.getFamily('P1');
  // Partners have birth/death years
  expect(family.partners[0].birth_year).toBe('1895');
  expect(family.partners[0].death_year).toBe('1960');
  // Children have birth year and other parent ID
  expect(family.children[0].birth_year).toBe('1921');
  expect(family.children[0].other_parent_id).toBe('P2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/db-handlers.test.js -t "getFamily returns birth_year"`
Expected: FAIL — `birth_year` is undefined

- [ ] **Step 3: Implement getFamily changes**

Replace the `getFamily` method in `src/db/handlers.js` (lines 260-281):

```javascript
getFamily(personId) {
  const birthYearSub = `(SELECT SUBSTR(e.date, -4) FROM events e WHERE e.person_id = p.id AND e.type = 'birth' LIMIT 1)`;
  const deathYearSub = `(SELECT SUBSTR(e.date, -4) FROM events e WHERE e.person_id = p.id AND e.type = 'death' LIMIT 1)`;

  const parents = all(
    `SELECT p.*, r.id as rel_id, ${birthYearSub} AS birth_year, ${deathYearSub} AS death_year
     FROM people p
     JOIN relationships r ON r.person_a_id = p.id
     WHERE r.person_b_id = ? AND r.type = 'parent_child'`,
    [personId]
  );
  const children = all(
    `SELECT p.*, r.id as rel_id, ${birthYearSub} AS birth_year, ${deathYearSub} AS death_year,
      (SELECT r2.person_a_id FROM relationships r2
       WHERE r2.person_b_id = p.id AND r2.type = 'parent_child' AND r2.person_a_id != ?
       LIMIT 1) AS other_parent_id
     FROM people p
     JOIN relationships r ON r.person_b_id = p.id
     WHERE r.person_a_id = ? AND r.type = 'parent_child'`,
    [personId, personId]
  );
  const partners = all(
    `SELECT p.*, r.id as rel_id, ${birthYearSub} AS birth_year, ${deathYearSub} AS death_year
     FROM people p
     JOIN relationships r ON (r.person_a_id = ? AND r.person_b_id = p.id)
                          OR (r.person_b_id = ? AND r.person_a_id = p.id)
     WHERE r.type = 'partner'`,
    [personId, personId]
  );
  return { parents, children, partners };
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/db-handlers.test.js -t "getFamily returns birth_year"`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/db/handlers.js tests/db-handlers.test.js
git commit -m "feat: add birth/death years and other_parent_id to getFamily"
```

---

### Task 2: Add edit mode gating to App.svelte

**Files:**
- Modify: `src/lib/components/App.svelte`

- [ ] **Step 1: Add panelEditing state and suppress navigation when editing**

In `src/lib/components/App.svelte`, add a new state variable after `wizardMode`:

```javascript
let panelEditing = $state(false);
```

Update the `PERSON_SELECTED` listener to check `panelEditing`:

```javascript
on(PERSON_SELECTED, (id) => {
  if (panelEditing) return; // don't navigate while panel is editing
  appState.selectedPersonId = id;
  selectedPersonId = id;
  setConfig('lastFocusedPerson', id);
});
```

Update the Panel rendering to pass `onEditChange`:

```svelte
{#key `${selectedPersonId}-${dataVersion}`}
  <Panel personId={selectedPersonId} onEditChange={(v) => panelEditing = v} />
{/key}
```

- [ ] **Step 2: Verify the app builds**

Run: `npm run dev` — verify no build errors in the terminal. (Panel.svelte doesn't use `onEditChange` yet — that's fine, unused props don't error in Svelte 5.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/App.svelte
git commit -m "feat: suppress panel navigation when panel is in edit mode"
```

---

### Task 3: Replace panel CSS

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Replace the panel CSS block**

Find the existing panel styles in `src/styles.css` (starting at `.panel-header` around line 411 through `.section-empty` around line 697) and replace with the new styles. Keep all non-panel styles untouched.

Replace from `.panel-header {` through `.rel-item-name:hover { text-decoration: underline; }` and `.section-empty` with:

```css
/* ─── Panel: Header ──────────────────────────────────────────────────── */

.panel-header {
  padding: 20px 20px 4px;
}
.panel-header-top {
  display: flex;
  justify-content: space-between;
  align-items: start;
}
.panel-name {
  font-size: 22px;
  font-weight: 700;
  color: var(--text);
  line-height: 1.2;
}
.panel-life-dates {
  font-size: 14px;
  color: var(--text-muted);
  margin-top: 2px;
}
.gender-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}
.gender-dot.M { background: #3b82f6; }
.gender-dot.F { background: #ec4899; }
.gender-dot.U { background: #9ca3af; }

.panel-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0 4px;
  line-height: 1;
}
.panel-close:hover { color: var(--text); }

.panel-edit-toggle {
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 12px;
  font-size: 12px;
  color: var(--text-muted);
  cursor: pointer;
}
.panel-edit-toggle:hover { border-color: var(--accent); color: var(--accent); }
.panel-edit-toggle.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

/* ─── Panel: Alt Names ───────────────────────────────────────────────── */

.panel-alt-names {
  padding: 8px 20px 4px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.alt-name-pill {
  font-size: 11px;
  padding: 2px 8px;
  background: #f3f4f6;
  border-radius: 99px;
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.alt-name-type {
  font-weight: 600;
  color: #9ca3af;
}
.alt-name-remove {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  color: #9ca3af;
  padding: 0 2px;
  line-height: 1;
}
.alt-name-remove:hover { color: var(--danger); }

/* ─── Panel: Section ─────────────────────────────────────────────────── */

.panel-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  padding: 12px 20px 8px;
  border-top: 1px solid var(--border);
}

/* ─── Panel: Event Cards ─────────────────────────────────────────────── */

.panel-events-list {
  padding: 0 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 8px;
}

.ev-card {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  background: #f9fafb;
  border-radius: 8px;
  border-left: 3px solid #e5e7eb;
  position: relative;
}
.ev-card.birth { border-left-color: #22c55e; }
.ev-card.death { border-left-color: #6b7280; }
.ev-card.marriage { border-left-color: #ec4899; }
.ev-card.census { border-left-color: #8b5cf6; }
.ev-card.occupation { border-left-color: #f59e0b; }
.ev-card.residence { border-left-color: #06b6d4; }
.ev-card.immigration { border-left-color: #10b981; }
.ev-card.emigration { border-left-color: #10b981; }

.ev-card-icon {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  flex-shrink: 0;
}
.ev-card-icon.birth { background: #dcfce7; color: #22c55e; }
.ev-card-icon.death { background: #f3f4f6; color: #6b7280; }
.ev-card-icon.marriage { background: #fce7f3; color: #ec4899; }
.ev-card-icon.census { background: #ede9fe; color: #8b5cf6; }
.ev-card-icon.occupation { background: #fef3c7; color: #f59e0b; }
.ev-card-icon.residence { background: #cffafe; color: #06b6d4; }

.ev-card-body { flex: 1; min-width: 0; }

.ev-card-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.ev-card-type {
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  text-transform: capitalize;
}
.ev-card-date { font-size: 11px; color: var(--text-muted); }

.ev-card-place { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.ev-card-detail { font-size: 12px; color: var(--text-muted); margin-top: 1px; }
.ev-card-participants { font-size: 11px; color: #3b82f6; margin-top: 2px; }
.ev-card-participants span { cursor: pointer; }
.ev-card-participants span:hover { text-decoration: underline; }

.ev-card-citation {
  font-size: 10px;
  color: #9ca3af;
  margin-top: 3px;
  font-style: italic;
}
.ev-card-citation a { color: #9ca3af; }
.ev-card-citation a:hover { color: var(--accent); }

/* Edit mode controls on cards */
.ev-card-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
}
.ev-card-actions button {
  background: none;
  border: none;
  font-size: 11px;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}
.ev-card-actions button:hover { color: var(--accent); }
.ev-card-actions .danger:hover { color: var(--danger); }

.ev-card-gap {
  font-size: 11px;
  color: var(--accent);
  margin-top: 3px;
  cursor: pointer;
}
.ev-card-gap:hover { text-decoration: underline; }

/* ─── Panel: Family ──────────────────────────────────────────────────── */

.panel-family {
  padding: 0 20px 8px;
}

.family-group {
  padding: 4px 0;
}
.family-group-label {
  font-size: 11px;
  color: #9ca3af;
  font-weight: 600;
  margin-bottom: 4px;
}
.family-group-with {
  font-size: 12px;
  color: #6b7280;
  margin: 8px 0 4px;
}

.family-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 13px;
  color: #3b82f6;
  cursor: pointer;
  margin: 2px 4px 2px 0;
  border: none;
}
.family-chip:hover { background: #eff6ff; }
.family-chip-dates {
  font-size: 10px;
  color: #9ca3af;
}
.family-chip-remove {
  background: none;
  border: none;
  font-size: 12px;
  color: #9ca3af;
  cursor: pointer;
  padding: 0 2px;
  margin-left: 2px;
}
.family-chip-remove:hover { color: var(--danger); }

.family-children {
  padding-left: 16px;
}

/* ─── Panel: Notes ───────────────────────────────────────────────────── */

.panel-notes {
  padding: 8px 20px 20px;
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.5;
}
.panel-notes a { color: var(--accent); }

/* ─── Panel: Participating Events ────────────────────────────────────── */

.panel-participating {
  padding: 0 20px 8px;
}
.participating-item {
  padding: 4px 0;
  font-size: 12px;
  color: var(--text-muted);
  border-bottom: 1px solid #f5f5f5;
}
.participating-item:last-child { border-bottom: none; }
.participating-type { font-weight: 600; color: #374151; text-transform: capitalize; }
.participating-role { color: #9ca3af; }
.participating-owner { color: #3b82f6; cursor: pointer; }
.participating-owner:hover { text-decoration: underline; }

/* ─── Panel: Shared ──────────────────────────────────────────────────── */

.section-empty {
  color: var(--text-muted);
  font-size: 13px;
  font-style: italic;
  padding: 4px 0;
}

.section-add-btn {
  font-size: 12px;
  margin-top: 4px;
}
```

- [ ] **Step 2: Verify no style regressions on other components**

Run: `npm run dev` — check the app loads. The panel will look broken until Task 4 rewrites the template, but other components (modals, forms, tree) should be unaffected.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: replace panel CSS with compact card styles"
```

---

### Task 4: Rewrite Panel.svelte template and script

**Files:**
- Modify: `src/lib/components/Panel.svelte` (complete rewrite)

- [ ] **Step 1: Rewrite Panel.svelte**

Replace the entire contents of `src/lib/components/Panel.svelte` with:

```svelte
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

  // Merge owned events + shared events into one timeline
  let allEvents = $derived.by(() => {
    const shared = sharedEvents.map(e => ({ ...e, _shared: true }));
    return [...events, ...shared].sort((a, b) =>
      (a.sort_date ?? Infinity) - (b.sort_date ?? Infinity)
    );
  });

  let birth = $derived(allEvents.find(e => e.type === 'birth'));
  let death = $derived(allEvents.find(e => e.type === 'death'));
  let isRoot = $derived(person && person.id === getConfig('rootPerson'));

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

  // Group children by their other parent
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

  // Notify parent of edit mode changes
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
  <!-- Header -->
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

  <!-- Alt Names -->
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

  <!-- Events -->
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
            {#if !hasCitations(ev)}
              <div class="ev-card-gap" onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>+ add citation</div>
            {/if}
            {#if !ev.place}
              <div class="ev-card-gap" onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>+ add place</div>
            {/if}
          {/if}
        </div>
        {#if editing}
          <div class="ev-card-actions">
            <button onclick={() => openEventForm(ev._shared ? null : person.id, ev.id)}>edit</button>
            <button class="danger" onclick={() => deleteEvent(ev.id)}>delete</button>
          </div>
        {/if}
      </div>
    {/each}
    {#if editing}
      <button class="btn btn-sm btn-link section-add-btn" onclick={() => openEventForm(person.id)}>+ Add Event</button>
    {/if}
  </div>

  <!-- Family -->
  <div class="panel-section-title">Family</div>
  <div class="panel-family">
    <!-- Parents -->
    {#if parents.length > 0 || editing}
      <div class="family-group">
        <div class="family-group-label">Parents</div>
        {#each parents as p}
          <span class="family-chip" onclick={() => navigate(p.id)}>
            <span class="gender-dot {p.gender}"></span>
            {formatName(p)}
            {#if formatLifeDates(p)}<span class="family-chip-dates">{formatLifeDates(p)}</span>{/if}
            {#if editing}<button class="family-chip-remove" onclick|stopPropagation={() => removeRelationship(p.rel_id)}>&times;</button>{/if}
          </span>
        {/each}
        {#if editing}
          <button class="btn btn-sm btn-link section-add-btn" onclick={() => openRelationshipForm(person, 'parent')}>+ Add Parent</button>
        {/if}
      </div>
    {/if}

    <!-- Partner groups with children -->
    {#each familyGroups as group}
      <div class="family-group">
        {#if group.partner}
          <div class="family-group-with">
            With
            <span class="family-chip" onclick={() => navigate(group.partner.id)}>
              <span class="gender-dot {group.partner.gender}"></span>
              {formatName(group.partner)}
              {#if formatLifeDates(group.partner)}<span class="family-chip-dates">{formatLifeDates(group.partner)}</span>{/if}
              {#if editing}<button class="family-chip-remove" onclick|stopPropagation={() => removeRelationship(group.partner.rel_id)}>&times;</button>{/if}
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
              {#if editing}<button class="family-chip-remove" onclick|stopPropagation={() => removeRelationship(c.rel_id)}>&times;</button>{/if}
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

  <!-- Participating Events -->
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

  <!-- Notes -->
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

  <!-- Edit mode: dangerous actions at bottom -->
  {#if editing}
    <div style="padding: 8px 20px 20px; border-top: 1px solid var(--border);">
      <button class="btn btn-sm" onclick={setRoot}>{isRoot ? 'Root person' : 'Set as root'}</button>
      <button class="btn btn-sm btn-danger" onclick={deletePerson}>Delete Person</button>
    </div>
  {/if}
{:else}
  <p style="padding:16px;color:var(--text-muted)">Person not found.</p>
{/if}
```

- [ ] **Step 2: Verify the panel renders in browse mode**

Run: `npm run dev` — click a person in the tree, verify:
- Name with gender dot shows
- Life dates appear
- Events show as coloured compact cards
- Family shows with chips grouped by partner
- No edit/delete buttons visible

- [ ] **Step 3: Verify edit mode works**

Click "Edit" — verify:
- Button changes to "Done" (highlighted)
- Close button disappears
- Event cards show edit/delete links
- Events missing citations show "+ add citation"
- Family chips show "x" remove buttons
- "+ Add" buttons appear in each section
- Delete Person button appears at bottom
- Clicking people in the tree does NOT change the panel

Click "Done" — verify panel returns to browse mode.

- [ ] **Step 4: Run test suite**

Run: `npm test`
Expected: All tests pass (Panel is a UI component, no handler tests affected)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/Panel.svelte
git commit -m "feat: redesign panel with compact cards and browse/edit modes"
```

---

### Task 5: Clean up removed CSS and verify

**Files:**
- Modify: `src/styles.css` (remove old panel classes that are no longer referenced)

- [ ] **Step 1: Search for orphaned CSS classes**

Check if any of the old panel CSS classes are still referenced elsewhere:
- `.panel-actions` — no longer used (replaced by edit toggle)
- `.panel-vitals` — no longer used (replaced by life dates in header)
- `.gender-badge` — no longer used (replaced by gender-dot)
- `.event-item`, `.event-item-header`, `.event-type`, `.event-date` — replaced by `.ev-card-*`
- `.rel-item`, `.rel-item-name` — replaced by `.family-chip`
- `.place-entry`, `.place-entry-name`, `.place-entry-detail` — places section removed (places shown on events)
- `.panel-section summary` — no longer using details/summary

Remove any orphaned classes that are no longer referenced by any component.

- [ ] **Step 2: Verify mobile responsiveness**

Check the existing mobile media query section in styles.css. Update if needed to ensure the new panel classes have appropriate mobile sizes (larger tap targets, bigger fonts).

Add to the existing `@media (max-width: 768px)` section:

```css
.ev-card { padding: 12px 14px; }
.family-chip { padding: 6px 12px; font-size: 14px; }
.panel-name { font-size: 20px; }
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "chore: clean up orphaned panel CSS, add mobile styles"
```

---

### Task 6: Final integration test

- [ ] **Step 1: Manual verification checklist**

Open the app and verify each item:

1. Browse mode:
   - [ ] Name + gender dot + life dates display correctly
   - [ ] Alternative names show as pills
   - [ ] Events display as coloured compact cards sorted chronologically
   - [ ] Shared events (marriage, census) show "with [names]"
   - [ ] Occupation events show the occupation text as detail
   - [ ] Citations show as subtle italic text
   - [ ] Family section shows parents, partner groups with children
   - [ ] Children grouped under correct partner
   - [ ] Clicking a family chip navigates to that person
   - [ ] Clicking in the tree navigates normally
   - [ ] Participating events show in separate section

2. Edit mode:
   - [ ] Toggle shows "Done" button, hides close button
   - [ ] Event cards show edit/delete buttons
   - [ ] Missing citations show "+ add citation" link
   - [ ] Missing places show "+ add place" link
   - [ ] "+ Add Event" button appears
   - [ ] Family chips show remove "x" buttons
   - [ ] "+ Add Parent/Partner/Child" buttons appear
   - [ ] "Edit Person" link appears in notes section
   - [ ] "Delete Person" button appears at bottom
   - [ ] Tree clicks do NOT change the panel
   - [ ] Clicking "Done" returns to browse mode

3. Data flow:
   - [ ] Adding an event via edit mode updates the panel
   - [ ] Deleting an event updates the panel
   - [ ] Adding a relationship updates the panel
   - [ ] Wizard still works (renders in panel area)

- [ ] **Step 2: Run full test suite one final time**

Run: `npm test`
Expected: All 187+ tests pass
