/**
 * event-form.js — Modal form for create/edit event + inline sources
 */

import { events, sources, places } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createPersonPicker } from './person-picker.js';

const EVENT_TYPES = [
  'birth', 'death', 'marriage', 'burial', 'residence',
  'census', 'immigration', 'emigration', 'naturalisation',
  'occupation', 'divorce', 'other',
];

const PARTICIPANT_ROLES = [
  'father', 'mother', 'witness', 'godfather', 'godmother',
  'informant', 'spouse', 'other',
];

/**
 * @param {string} personId
 * @param {string} [eventId] — if provided, edit mode
 */
export async function openEventForm(personId, eventId) {
  const isEdit = !!eventId;
  let existing = null;
  let existingSources = [];

  let existingParticipants = [];

  if (isEdit) {
    const eventList = await events.list(personId);
    existing = eventList.find(e => e.id === eventId);
    if (!existing) return;
    existingSources = await sources.list(eventId);
    existingParticipants = await events.getParticipants(eventId);
  }

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group">
      <label for="ef-type">Type</label>
      <select id="ef-type">
        ${EVENT_TYPES.map(t => `<option value="${t}" ${existing?.type === t ? 'selected' : ''}>${capitalize(t)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="ef-date">Date</label>
      <input id="ef-date" type="text" value="${esc(existing?.date || '')}" placeholder="e.g. 3 SEP 1913, ABT 1890" autocomplete="off">
      <span class="form-hint">Free text — e.g. "1901", "BET 1889 AND 1890", "ABT MAR 1920"</span>
    </div>
    <div class="form-group" style="position:relative">
      <label for="ef-place">Place</label>
      <input id="ef-place" type="text" value="${esc(existing?.place || '')}" autocomplete="off">
      <div id="ef-place-suggestions" class="place-suggestions"></div>
    </div>
    <div class="form-group">
      <label for="ef-notes">Notes</label>
      <textarea id="ef-notes" rows="2">${esc(existing?.notes || '')}</textarea>
    </div>

    <div class="form-group">
      <label>Participants</label>
      <div id="ef-participants"></div>
      <div id="ef-add-participant"></div>
    </div>

    <div class="form-group">
      <label>Sources</label>
      <div id="ef-sources"></div>
      <button type="button" class="btn btn-sm btn-link" id="ef-add-source">+ Add Source</button>
    </div>

    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? `Edit Event` : 'New Event';
  const { close } = openModal({ title, content: form });

  // Render existing sources
  const sourcesContainer = form.querySelector('#ef-sources');
  const sourceEntries = []; // { id?, title, url, deleted? }

  for (const s of existingSources) {
    sourceEntries.push({ id: s.id, title: s.title, url: s.url });
  }
  renderSources();

  // Participants
  const participantsContainer = form.querySelector('#ef-participants');
  const participantEntries = []; // { person_id, given_name, surname, role, isNew, removed }

  for (const p of existingParticipants) {
    participantEntries.push({
      person_id: p.person_id,
      given_name: p.given_name,
      surname: p.surname,
      role: p.role,
      isNew: false,
      removed: false,
    });
  }
  renderParticipants();

  const pickerContainer = form.querySelector('#ef-add-participant');
  const picker = createPersonPicker({
    excludeIds: [personId],
    onSelect: (person) => {
      if (participantEntries.some(e => e.person_id === person.id && !e.removed)) return;
      participantEntries.push({
        person_id: person.id,
        given_name: person.given_name,
        surname: person.surname,
        role: 'witness',
        isNew: true,
        removed: false,
      });
      renderParticipants();
    },
  });
  pickerContainer.appendChild(picker);

  function renderParticipants() {
    participantsContainer.innerHTML = '';
    const active = participantEntries.filter(e => !e.removed);
    if (active.length === 0) {
      participantsContainer.innerHTML = '<div class="section-empty" style="margin:4px 0">No participants</div>';
      return;
    }
    for (const entry of active) {
      const name = [entry.given_name, entry.surname].filter(Boolean).join(' ') || 'Unnamed';
      const row = document.createElement('div');
      row.className = 'participant-row';
      row.innerHTML = `
        <span class="participant-name">${esc(name)}</span>
        <select class="participant-role">
          ${PARTICIPANT_ROLES.map(r => `<option value="${r}" ${r === entry.role ? 'selected' : ''}>${capitalize(r)}</option>`).join('')}
        </select>
        <button type="button" class="btn-link btn-sm" style="color:var(--danger)">Remove</button>
      `;
      row.querySelector('select').onchange = (e) => { entry.role = e.target.value; };
      row.querySelector('button').onclick = () => { entry.removed = true; renderParticipants(); };
      participantsContainer.appendChild(row);
    }
  }

  // Place autocomplete
  const placeInput = form.querySelector('#ef-place');
  const placeSuggestions = form.querySelector('#ef-place-suggestions');
  let placeTimer = null;
  let selectedPlaceId = existing?.place_id || null;

  placeInput.addEventListener('input', () => {
    selectedPlaceId = null; // clear link when user types
    clearTimeout(placeTimer);
    const q = placeInput.value.trim();
    if (!q) { placeSuggestions.innerHTML = ''; placeSuggestions.style.display = 'none'; return; }
    placeTimer = setTimeout(async () => {
      const results = await places.search(q);
      if (results.length === 0) { placeSuggestions.style.display = 'none'; return; }
      placeSuggestions.innerHTML = '';
      for (const r of results) {
        const div = document.createElement('div');
        div.className = 'place-suggestion';
        div.textContent = (r.full_name || r.name) + (r.type ? ` (${r.type})` : '');
        div.onclick = () => {
          placeInput.value = r.full_name || r.name;
          selectedPlaceId = r.id;
          placeSuggestions.style.display = 'none';
        };
        placeSuggestions.appendChild(div);
      }
      placeSuggestions.style.display = 'block';
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!placeInput.contains(e.target) && !placeSuggestions.contains(e.target)) {
      placeSuggestions.style.display = 'none';
    }
  });

  form.querySelector('#ef-add-source').onclick = () => {
    sourceEntries.push({ title: '', url: '' });
    renderSources();
  };

  function renderSources() {
    sourcesContainer.innerHTML = '';
    sourceEntries.forEach((s, i) => {
      if (s.deleted) return;
      const row = document.createElement('div');
      row.className = 'source-add-fields';
      row.innerHTML = `
        <input type="text" placeholder="Title" value="${esc(s.title)}" data-idx="${i}" data-field="title">
        <input type="text" placeholder="URL" value="${esc(s.url)}" data-idx="${i}" data-field="url">
        <button type="button" class="btn-link btn-sm" style="color:var(--danger);align-self:flex-start" data-remove="${i}">Remove</button>
      `;
      row.querySelectorAll('input').forEach(inp => {
        inp.oninput = () => {
          sourceEntries[inp.dataset.idx][inp.dataset.field] = inp.value;
        };
      });
      row.querySelector('[data-remove]').onclick = () => {
        sourceEntries[i].deleted = true;
        renderSources();
      };
      sourcesContainer.appendChild(row);
    });
  }

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      type: form.querySelector('#ef-type').value,
      date: form.querySelector('#ef-date').value.trim(),
      place: form.querySelector('#ef-place').value.trim(),
      place_id: selectedPlaceId,
      notes: form.querySelector('#ef-notes').value.trim(),
    };

    try {
      if (isEdit) {
        await events.update(eventId, data);
        // Handle sources: delete removed, update existing, create new
        for (const s of sourceEntries) {
          if (s.deleted && s.id) {
            await sources.delete(s.id);
          } else if (s.id && !s.deleted) {
            await sources.update(s.id, { title: s.title, url: s.url });
          } else if (!s.id && !s.deleted && (s.title || s.url)) {
            await sources.create(eventId, { title: s.title, url: s.url });
          }
        }
        // Handle participants: remove deleted, update roles, add new
        for (const p of participantEntries) {
          if (p.removed && !p.isNew) {
            await events.removeParticipant(eventId, p.person_id);
          } else if (p.isNew && !p.removed) {
            await events.addParticipant(eventId, p.person_id, p.role);
          } else if (!p.isNew && !p.removed) {
            await events.updateParticipantRole(eventId, p.person_id, p.role);
          }
        }
        close();
        emit(DATA_CHANGED);
        showToast('Event updated');
      } else {
        const created = await events.create(personId, data);
        // Create sources
        for (const s of sourceEntries) {
          if (!s.deleted && (s.title || s.url)) {
            await sources.create(created.id, { title: s.title, url: s.url });
          }
        }
        // Create participants
        for (const p of participantEntries) {
          if (!p.removed) {
            await events.addParticipant(created.id, p.person_id, p.role);
          }
        }
        close();
        emit(DATA_CHANGED);
        showToast('Event created');
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
