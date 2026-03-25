/**
 * event-form.js — Modal form for create/edit event + inline citations
 */

import { events, citations, places } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createPersonPicker } from './person-picker.js';
import { createSourcePicker } from './source-picker.js';
import { openPlaceForm } from './place-form.js';

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

/**
 * @param {string} personId
 * @param {string} [eventId] — if provided, edit mode
 */
export async function openEventForm(personId, eventId) {
  const isEdit = !!eventId;
  let existing = null;
  let existingCitations = [];

  let existingParticipants = [];

  if (isEdit) {
    const eventList = await events.list(personId);
    existing = eventList.find(e => e.id === eventId);
    if (!existing) return;
    existingCitations = await citations.listForEvent(eventId);
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
      <button type="button" class="btn btn-sm btn-link" id="ef-new-place">+ New place</button>
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
      <label>Citations</label>
      <div id="ef-citations"></div>
      <button type="button" class="btn btn-sm btn-link" id="ef-add-citation">+ Add Citation</button>
    </div>

    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? `Edit Event` : 'New Event';
  const { close } = openModal({ title, content: form });

  // Render existing citations
  const citationsContainer = form.querySelector('#ef-citations');
  const citationEntries = []; // { id?, source_id, source_title, detail, url, accessed, confidence, deleted? }

  for (const c of existingCitations) {
    citationEntries.push({
      id: c.id,
      source_id: c.source_id,
      source_title: c.source_title,
      detail: c.detail,
      url: c.url,
      accessed: c.accessed,
      confidence: c.confidence,
    });
  }
  renderCitations();

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

  form.querySelector('#ef-new-place').onclick = () => {
    openPlaceForm(null, (newPlace) => {
      placeInput.value = newPlace.name;
      selectedPlaceId = newPlace.id;
      places.hierarchy(newPlace.id).then(h => {
        if (h.length > 0) placeInput.value = h.map(p => p.name).reverse().join(', ');
      });
    });
  };

  form.querySelector('#ef-add-citation').onclick = () => {
    citationEntries.push({ source_id: null, source_title: '', detail: '', url: '', accessed: '', confidence: '' });
    renderCitations();
  };

  function renderCitations() {
    citationsContainer.innerHTML = '';
    citationEntries.forEach((c, i) => {
      if (c.deleted) return;
      const row = document.createElement('div');
      row.className = 'citation-row';

      // Source picker row
      const sourceRow = document.createElement('div');
      sourceRow.className = 'citation-source-row';

      if (c.source_id) {
        // Show selected source name
        const sourceLabel = document.createElement('span');
        sourceLabel.className = 'citation-source-label';
        sourceLabel.textContent = c.source_title || '(unnamed source)';
        sourceRow.appendChild(sourceLabel);
        const changeBtn = document.createElement('button');
        changeBtn.type = 'button';
        changeBtn.className = 'btn-link btn-sm';
        changeBtn.textContent = 'change';
        changeBtn.onclick = () => {
          c.source_id = null;
          c.source_title = '';
          renderCitations();
        };
        sourceRow.appendChild(changeBtn);
      } else {
        // Show source picker
        const sourcePicker = createSourcePicker({
          onSelect: (source) => {
            c.source_id = source.id;
            c.source_title = source.title;
            renderCitations();
          },
        });
        sourceRow.appendChild(sourcePicker);
      }

      row.appendChild(sourceRow);

      // Detail fields
      const detailsRow = document.createElement('div');
      detailsRow.className = 'citation-details-row';
      detailsRow.innerHTML = `
        <input type="text" placeholder="Detail (page, entry, volume...)" value="${esc(c.detail)}" data-idx="${i}" data-field="detail">
        <input type="text" placeholder="Direct URL to record" value="${esc(c.url)}" data-idx="${i}" data-field="url">
        <input type="text" placeholder="Date accessed" value="${esc(c.accessed)}" data-idx="${i}" data-field="accessed">
        <select data-idx="${i}" data-field="confidence">
          ${CONFIDENCE_OPTIONS.map(o => `<option value="${o.value}" ${o.value === c.confidence ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
        <div class="citation-details-actions">
          <button type="button" class="btn-link btn-sm" style="color:var(--danger)" data-remove="${i}">Remove</button>
        </div>
      `;
      detailsRow.querySelectorAll('input').forEach(inp => {
        inp.oninput = () => { citationEntries[inp.dataset.idx][inp.dataset.field] = inp.value; };
      });
      detailsRow.querySelector('select').onchange = (e) => {
        citationEntries[e.target.dataset.idx].confidence = e.target.value;
      };
      detailsRow.querySelector('[data-remove]').onclick = () => {
        citationEntries[i].deleted = true;
        renderCitations();
      };

      row.appendChild(detailsRow);
      citationsContainer.appendChild(row);
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
        // Handle citations: delete removed, update existing, create new
        for (const c of citationEntries) {
          if (c.deleted && c.id) {
            await citations.delete(c.id);
          } else if (c.id && !c.deleted && c.source_id) {
            await citations.update(c.id, { source_id: c.source_id, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
          } else if (!c.id && !c.deleted && c.source_id) {
            await citations.create({ source_id: c.source_id, event_id: eventId, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
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
        // Create citations
        for (const c of citationEntries) {
          if (!c.deleted && c.source_id) {
            await citations.create({ source_id: c.source_id, event_id: created.id, detail: c.detail, url: c.url, accessed: c.accessed, confidence: c.confidence });
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
