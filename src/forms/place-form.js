/**
 * place-form.js — Modal form for create/edit place
 */

import { places } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { createPlacePicker } from './place-picker.js';
import { placeTypeOptions } from '../util/place-types.js';

/**
 * @param {string} [placeId] — if provided, edit mode
 * @param {function} [onComplete] — callback with place when created/updated
 */
export async function openPlaceForm(placeId, onComplete) {
  const isEdit = !!placeId;
  let existing = null;

  if (isEdit) {
    existing = await places.get(placeId);
    if (!existing) return;
  }

  const form = document.createElement('form');

  let selectedParentId = existing?.parent_id || null;
  let selectedParentName = '';

  // If editing and has parent, fetch parent name
  if (selectedParentId) {
    const parent = await places.get(selectedParentId);
    selectedParentName = parent?.name || '';
  }

  form.innerHTML = `
    <div class="form-group">
      <label for="plf-name">Name</label>
      <input id="plf-name" type="text" value="${esc(existing?.name || '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="plf-type">Type</label>
      <select id="plf-type">
        ${placeTypeOptions(existing?.type || '')}
      </select>
    </div>
    <div class="form-group">
      <label>Parent Place</label>
      <div id="plf-parent-picker"></div>
    </div>
    <div class="form-group">
      <label for="plf-notes">Notes</label>
      <textarea id="plf-notes" rows="2">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? `Edit ${existing.name}` : 'New Place';
  const { close } = openModal({ title, content: form });

  // Set up parent picker
  const pickerContainer = form.querySelector('#plf-parent-picker');
  const excludeIds = isEdit ? [placeId] : [];
  const picker = createPlacePicker({
    onSelect: (p) => { selectedParentId = p.id; },
    excludeIds,
  });
  pickerContainer.appendChild(picker);

  // Pre-fill parent picker if editing
  if (selectedParentName) {
    const pickerInput = picker.querySelector('input');
    if (pickerInput) pickerInput.value = selectedParentName;
  }

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: form.querySelector('#plf-name').value.trim(),
      type: form.querySelector('#plf-type').value,
      parent_id: selectedParentId,
      notes: form.querySelector('#plf-notes').value.trim(),
    };

    if (!data.name) {
      showToast('Name is required');
      return;
    }

    try {
      if (isEdit) {
        const updated = await places.update(placeId, data);
        close();
        emit(DATA_CHANGED);
        showToast('Place updated');
        onComplete?.(updated);
      } else {
        const created = await places.create(data);
        close();
        emit(DATA_CHANGED);
        showToast(`Created ${data.name}`);
        onComplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  setTimeout(() => form.querySelector('#plf-name').focus(), 50);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
