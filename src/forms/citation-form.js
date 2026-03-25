/**
 * citation-form.js — Modal form for create/edit citation
 */

import { citations } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createSourcePicker } from './source-picker.js';

const CONFIDENCE_OPTIONS = [
  { value: '', label: '(unspecified)' },
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'questionable', label: 'Questionable' },
];

/**
 * @param {string} [citationId] — if provided, edit mode
 * @param {function} [onComplete] — callback with citation when created/updated
 * @param {Object} [prefill] — prefill values (e.g. { source_id, source_title, event_id })
 */
export async function openCitationForm(citationId, onComplete, prefill) {
  const isEdit = !!citationId;
  let existing = null;

  if (isEdit) {
    existing = await citations.get(citationId);
    if (!existing) return;
  }

  let selectedSourceId = existing?.source_id || prefill?.source_id || null;
  let selectedSourceTitle = prefill?.source_title || '';

  // If editing, we need the source title
  if (isEdit && selectedSourceId && !selectedSourceTitle) {
    const list = await citations.listForSource(selectedSourceId);
    // The listForEvent would have source_title but we don't have event_id here
    // Just use the source_id for now, the picker will show it
  }

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group">
      <label>Source</label>
      <div id="cf-source-picker"></div>
    </div>
    <div class="form-group">
      <label for="cf-detail">Detail</label>
      <input id="cf-detail" type="text" value="${esc(existing?.detail || '')}" placeholder="Page, entry, volume..." autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-url">Direct URL</label>
      <input id="cf-url" type="text" value="${esc(existing?.url || '')}" placeholder="https://... link to specific record" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-accessed">Date Accessed</label>
      <input id="cf-accessed" type="text" value="${esc(existing?.accessed || '')}" placeholder="e.g. 2025-03-25" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="cf-confidence">Confidence</label>
      <select id="cf-confidence">
        ${CONFIDENCE_OPTIONS.map(o => `<option value="${o.value}" ${(existing?.confidence || '') === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="cf-notes">Notes</label>
      <textarea id="cf-notes" rows="2">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? 'Edit Citation' : 'New Citation';
  const { close } = openModal({ title, content: form });

  // Source picker
  const pickerContainer = form.querySelector('#cf-source-picker');
  if (selectedSourceId) {
    // Show pre-selected source with option to change
    renderSelectedSource();
  } else {
    renderSourcePicker();
  }

  function renderSelectedSource() {
    pickerContainer.innerHTML = '';
    const row = document.createElement('div');
    row.className = 'citation-source-row';
    const label = document.createElement('span');
    label.className = 'citation-source-label';
    label.textContent = selectedSourceTitle || '(source selected)';
    row.appendChild(label);
    const changeBtn = document.createElement('button');
    changeBtn.type = 'button';
    changeBtn.className = 'btn-link btn-sm';
    changeBtn.textContent = 'change';
    changeBtn.onclick = () => {
      selectedSourceId = null;
      selectedSourceTitle = '';
      renderSourcePicker();
    };
    row.appendChild(changeBtn);
    pickerContainer.appendChild(row);
  }

  function renderSourcePicker() {
    pickerContainer.innerHTML = '';
    const picker = createSourcePicker({
      onSelect: (source) => {
        selectedSourceId = source.id;
        selectedSourceTitle = source.title;
        renderSelectedSource();
      },
    });
    pickerContainer.appendChild(picker);
  }

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();

    if (!selectedSourceId) {
      showToast('Please select a source');
      return;
    }

    const data = {
      source_id: selectedSourceId,
      detail: form.querySelector('#cf-detail').value.trim(),
      url: form.querySelector('#cf-url').value.trim(),
      accessed: form.querySelector('#cf-accessed').value.trim(),
      confidence: form.querySelector('#cf-confidence').value,
      notes: form.querySelector('#cf-notes').value.trim(),
    };

    // event_id comes from prefill for new citations
    if (!isEdit && prefill?.event_id) {
      data.event_id = prefill.event_id;
    }

    try {
      if (isEdit) {
        const updated = await citations.update(citationId, data);
        close();
        emit(DATA_CHANGED);
        showToast('Citation updated');
        onComplete?.(updated);
      } else {
        if (!data.event_id) {
          showToast('No event linked — citation needs an event');
          return;
        }
        const created = await citations.create(data);
        close();
        emit(DATA_CHANGED);
        showToast('Citation created');
        onComplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
