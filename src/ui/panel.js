/**
 * panel.js — Person detail panel (read view + action triggers)
 */

import { people, relationships, events as eventsApi } from '../db/db.js';
import { emit, PERSON_DESELECTED, PERSON_SELECTED, DATA_CHANGED } from '../state.js';
import { openPersonForm } from '../forms/person-form.js';
import { openEventForm } from '../forms/event-form.js';
import { openRelationshipForm } from '../forms/relationship-form.js';
import { focusPerson } from './tree.js';
import { showToast } from './toast.js';

const panelContent = () => document.getElementById('panel-content');

export async function renderPanel(personId) {
  const el = panelContent();
  const result = await people.getWithEvents(personId);

  if (!result) {
    el.innerHTML = '<p style="padding:16px;color:var(--text-muted)">Person not found.</p>';
    return;
  }

  const { person, events, participatingEvents, parents, children, partners } = result;
  const fullName = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  const genderLabel = { M: 'Male', F: 'Female', U: 'Unknown' }[person.gender] || 'Unknown';

  // Extract birth/death for vitals
  const birth = events.find(e => e.type === 'birth');
  const death = events.find(e => e.type === 'death');

  el.innerHTML = `
    <div class="panel-header">
      <h2>${esc(fullName)}</h2>
      <span class="gender-badge ${person.gender}">${genderLabel}</span>
      <button class="panel-close" data-action="close">&times;</button>
    </div>

    <div class="panel-actions">
      <button class="btn btn-sm" data-action="edit-person">Edit</button>
      <button class="btn btn-sm btn-danger" data-action="delete-person">Delete</button>
    </div>

    ${birth || death ? `
    <div class="panel-vitals">
      ${birth ? `<div>Born: <span>${esc(birth.date || '')}${birth.place ? ' — ' + esc(birth.place) : ''}</span></div>` : ''}
      ${death ? `<div>Died: <span>${esc(death.date || '')}${death.place ? ' — ' + esc(death.place) : ''}</span></div>` : ''}
    </div>` : ''}

    ${person.notes ? `<div class="panel-vitals"><div style="white-space:pre-wrap">${linkify(person.notes)}</div></div>` : ''}

    <details class="panel-section" open>
      <summary>Events (${events.length})</summary>
      <div class="panel-events">
        ${events.length === 0 ? '<div class="section-empty">No events</div>' : events.map(ev => renderEvent(ev, true)).join('')}
        <button class="btn btn-sm btn-link section-add-btn" data-action="add-event">+ Add Event</button>
      </div>
    </details>

    ${participatingEvents.length > 0 ? `
    <details class="panel-section">
      <summary>Participating Events (${participatingEvents.length})</summary>
      <div class="panel-events">
        ${participatingEvents.map(ev => renderParticipatingEvent(ev)).join('')}
      </div>
    </details>` : ''}

    <details class="panel-section" open>
      <summary>Parents (${parents.length})</summary>
      <div class="panel-rels">
        ${parents.length === 0 ? '<div class="section-empty">No parents</div>' : parents.map(p => renderRelPerson(p)).join('')}
        <button class="btn btn-sm btn-link section-add-btn" data-action="add-parent">+ Add Parent</button>
      </div>
    </details>

    <details class="panel-section" open>
      <summary>Partners (${partners.length})</summary>
      <div class="panel-rels">
        ${partners.length === 0 ? '<div class="section-empty">No partners</div>' : partners.map(p => renderRelPerson(p)).join('')}
        <button class="btn btn-sm btn-link section-add-btn" data-action="add-partner">+ Add Partner</button>
      </div>
    </details>

    <details class="panel-section" open>
      <summary>Children (${children.length})</summary>
      <div class="panel-rels">
        ${children.length === 0 ? '<div class="section-empty">No children</div>' : children.map(p => renderRelPerson(p)).join('')}
        <button class="btn btn-sm btn-link section-add-btn" data-action="add-child">+ Add Child</button>
      </div>
    </details>
  `;

  // Event delegation
  el.onclick = (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'close') emit(PERSON_DESELECTED);
    else if (action === 'edit-person') openPersonForm(person.id);
    else if (action === 'delete-person') deletePerson(person);
    else if (action === 'add-event') openEventForm(person.id);
    else if (action === 'edit-event') openEventForm(person.id, btn.dataset.eventId);
    else if (action === 'delete-event') deleteEvent(btn.dataset.eventId);
    else if (action === 'add-parent') openRelationshipForm(person, 'parent');
    else if (action === 'add-partner') openRelationshipForm(person, 'partner');
    else if (action === 'add-child') openRelationshipForm(person, 'child');
    else if (action === 'navigate') {
      const id = btn.dataset.personId;
      focusPerson(id);
      emit(PERSON_SELECTED, id);
    }
    else if (action === 'remove-rel') removeRelationship(btn.dataset.relId);
  };
}

function renderEvent(ev, editable) {
  const sourcesHtml = (ev.sources || []).filter(s => s.title || s.url).map(s =>
    s.url ? `<div><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title || s.url)}</a></div>` : `<div>${esc(s.title)}</div>`
  ).join('');

  return `
    <div class="event-item">
      <div class="event-item-header">
        <span class="event-type">${esc(ev.type)}</span>
        ${ev.date ? `<span class="event-date">${esc(ev.date)}</span>` : ''}
        ${editable ? `
        <span class="event-actions">
          <button class="btn-link btn-sm" data-action="edit-event" data-event-id="${ev.id}">edit</button>
          <button class="btn-link btn-sm" style="color:var(--danger)" data-action="delete-event" data-event-id="${ev.id}">delete</button>
        </span>` : ''}
      </div>
      ${ev.place ? `<div class="event-place">${esc(ev.place)}</div>` : ''}
      ${ev.notes ? `<div class="event-notes">${linkify(ev.notes)}</div>` : ''}
      ${sourcesHtml ? `<div class="event-sources">${sourcesHtml}</div>` : ''}
    </div>
  `;
}

function renderParticipatingEvent(ev) {
  return `
    <div class="event-item">
      <div class="event-item-header">
        <span class="event-type">${esc(ev.type)}</span>
        ${ev.date ? `<span class="event-date">${esc(ev.date)}</span>` : ''}
      </div>
      ${ev.place ? `<div class="event-place">${esc(ev.place)}</div>` : ''}
      <div class="event-participant-info">
        Role: ${esc(ev.participant_role || 'participant')} &middot;
        Owner: <a href="#" data-action="navigate" data-person-id="${ev.owner_id}">${esc(ev.owner_name)}</a>
      </div>
    </div>
  `;
}

function renderRelPerson(p) {
  const name = [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
  return `
    <div class="rel-item">
      <span class="rel-item-name" data-action="navigate" data-person-id="${p.id}">${esc(name)}</span>
      <button class="btn-link btn-sm" style="color:var(--danger)" data-action="remove-rel" data-rel-id="${p.rel_id}">remove</button>
    </div>
  `;
}

async function deletePerson(person) {
  const name = [person.given_name, person.surname].filter(Boolean).join(' ') || 'Unnamed';
  if (!confirm(`Delete ${name}? This will remove all their events and relationships.`)) return;
  await people.delete(person.id);
  emit(PERSON_DESELECTED);
  emit(DATA_CHANGED);
  showToast(`Deleted ${name}`);
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

export function clearPanel() {
  panelContent().innerHTML = '';
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function linkify(str) {
  return esc(str).replace(
    /https?:\/\/[^\s<]+/g,
    url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`
  );
}
