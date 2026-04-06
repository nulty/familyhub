<script>
  import { people, relationships, events as eventsApi } from '../../db/db.js';
  import { emit, on, DATA_CHANGED, PERSON_SELECTED } from '../../state.js';
  import { focusPerson } from '../../ui/tree.js';
  import { openEventForm, openCitationForm } from '../shared/open.js';
  import { showToast } from '../shared/toast-store.js';

  let { startPersonId, onclose } = $props();

  let queue = $state([]);       // { id, name } of people needing attention
  let allPeople = $state([]);   // full traversal order (for progress)
  let currentIndex = $state(0);
  let currentData = $state(null);
  let issues = $state([]);
  let loading = $state(true);

  let currentPerson = $derived(queue[currentIndex] || null);
  let progress = $derived(queue.length > 0 ? `${currentIndex + 1} of ${queue.length}` : '');

  // Rebuild when data changes (user adds an event via the form)
  let unsub;
  $effect(() => {
    unsub = on(DATA_CHANGED, () => {
      if (currentPerson) loadPerson(currentPerson.id);
    });
    return () => unsub?.();
  });

  $effect(() => {
    if (startPersonId) buildQueue(startPersonId);
  });

  async function buildQueue(startId) {
    loading = true;
    const visited = new Set();
    const ordered = [];

    async function traverse(personId) {
      if (visited.has(personId)) return;
      visited.add(personId);

      const data = await people.getWithEvents(personId);
      if (!data) return;

      const name = [data.person.given_name, data.person.surname].filter(Boolean).join(' ') || 'Unnamed';
      ordered.push({ id: personId, name });

      // Spouse(s) first
      for (const p of data.partners) {
        await traverse(p.id);
      }
      // Parents (go up)
      for (const p of data.parents) {
        await traverse(p.id);
      }
      // Children (go down)
      for (const p of data.children) {
        await traverse(p.id);
      }
    }

    await traverse(startId);
    allPeople = ordered;

    // Check completeness for each person, filter to those with issues
    const needsWork = [];
    for (const entry of ordered) {
      const data = await people.getWithEvents(entry.id);
      const personIssues = checkCompleteness(data);
      if (personIssues.length > 0) {
        needsWork.push(entry);
      }
    }

    queue = needsWork;
    currentIndex = 0;
    loading = false;

    if (queue.length > 0) {
      await loadPerson(queue[0].id);
    }
  }

  function checkCompleteness(result) {
    const found = [];
    const { person, events, sharedEvents, partners } = result;
    const allEvents = [...events, ...sharedEvents];

    if (!allEvents.some(e => e.type === 'birth'))
      found.push({ type: 'missing_event', eventType: 'birth', label: 'No birth event' });

    if (!allEvents.some(e => e.type === 'death'))
      found.push({ type: 'missing_event', eventType: 'death', label: 'No death event' });

    if (partners.length > 0 && !allEvents.some(e => e.type === 'marriage'))
      found.push({ type: 'missing_event', eventType: 'marriage', label: 'No marriage event' });

    for (const ev of allEvents) {
      if (!ev.place_id)
        found.push({ type: 'no_place', eventId: ev.id, eventType: ev.type, label: `${capitalize(ev.type)} has no place` });
      if (!ev.citations || ev.citations.filter(c => c.source_title || c.url).length === 0)
        found.push({ type: 'uncited_event', eventId: ev.id, eventType: ev.type, label: `${capitalize(ev.type)} has no citation` });
    }

    return found;
  }

  async function loadPerson(id) {
    const data = await people.getWithEvents(id);
    if (!data) return;
    currentData = data;
    issues = checkCompleteness(data);
    focusPerson(id);
    emit(PERSON_SELECTED, id);

    // If this person has no more issues, auto-advance
    if (issues.length === 0 && queue.length > 0) {
      // Remove from queue and load next
      queue = queue.filter(p => p.id !== id);
      if (currentIndex >= queue.length) currentIndex = Math.max(0, queue.length - 1);
      if (queue.length > 0) {
        await loadPerson(queue[currentIndex].id);
      }
    }
  }

  function goNext() {
    if (currentIndex < queue.length - 1) {
      currentIndex++;
      loadPerson(queue[currentIndex].id);
    }
  }

  function goPrev() {
    if (currentIndex > 0) {
      currentIndex--;
      loadPerson(queue[currentIndex].id);
    }
  }

  function handleAction(issue) {
    if (issue.type === 'missing_event') {
      openEventForm(currentPerson.id, null);
    } else if (issue.type === 'uncited_event' || issue.type === 'no_place') {
      openEventForm(currentData?.person?.id || currentPerson.id, issue.eventId);
    }
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
</script>

<div class="wizard-panel">
  <div class="wizard-header">
    <h3>Data Entry Wizard</h3>
    <button class="panel-close" onclick={onclose}>&times;</button>
  </div>

  {#if loading}
    <div class="wizard-loading">Scanning tree for incomplete records...</div>
  {:else if queue.length === 0}
    <div class="wizard-complete">
      <h4>All done!</h4>
      <p>Every person in the tree has the key events recorded with citations.</p>
      <p class="wizard-stats">{allPeople.length} people checked</p>
      <button class="btn btn-primary" onclick={onclose}>Close Wizard</button>
    </div>
  {:else}
    <div class="wizard-progress">
      <span>{progress} need attention</span>
      <span class="wizard-total">{allPeople.length} total in tree</span>
    </div>

    <div class="wizard-person">
      <h4>{currentPerson.name}</h4>
    </div>

    <div class="wizard-issues">
      {#each issues as issue}
        <div class="wizard-issue">
          <span class="wizard-issue-icon">&#9675;</span>
          <span class="wizard-issue-label">{issue.label}</span>
          <button class="btn btn-sm" onclick={() => handleAction(issue)}>
            {issue.type === 'missing_event' ? 'Add' : 'Edit'}
          </button>
        </div>
      {/each}
      {#if issues.length === 0}
        <div class="wizard-issue wizard-issue-done">
          <span class="wizard-issue-icon">&#10003;</span>
          <span class="wizard-issue-label">All good — moving on...</span>
        </div>
      {/if}
    </div>

    <div class="wizard-nav">
      <button class="btn btn-sm" onclick={goPrev} disabled={currentIndex === 0}>Previous</button>
      <button class="btn btn-sm" onclick={goNext} disabled={currentIndex >= queue.length - 1}>
        {currentIndex < queue.length - 1 ? 'Skip' : 'Done'}
      </button>
    </div>
  {/if}
</div>
