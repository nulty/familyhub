/**
 * person-form.js — Modal form for create/edit person
 */

import { people } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

/**
 * @param {string} [personId] — if provided, edit mode; otherwise create
 * @param {function} [onCreated] — callback with new person when created (for picker flow)
 */
export async function openPersonForm(personId, onCreated) {
  const isEdit = !!personId;
  let existing = null;

  if (isEdit) {
    existing = await people.get(personId);
    if (!existing) return;
  }

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group">
      <label for="pf-given">Given Name</label>
      <input id="pf-given" type="text" value="${esc(existing?.given_name || '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="pf-surname">Surname</label>
      <input id="pf-surname" type="text" value="${esc(existing?.surname || '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="pf-gender">Gender</label>
      <select id="pf-gender">
        <option value="M" ${existing?.gender === 'M' ? 'selected' : ''}>Male</option>
        <option value="F" ${existing?.gender === 'F' ? 'selected' : ''}>Female</option>
        <option value="U" ${!existing || existing?.gender === 'U' ? 'selected' : ''}>Unknown</option>
      </select>
    </div>
    <div class="form-group">
      <label for="pf-notes">Notes</label>
      <textarea id="pf-notes" rows="3">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit
    ? `Edit ${[existing.given_name, existing.surname].filter(Boolean).join(' ')}`
    : 'New Person';

  const { close } = openModal({ title, content: form });

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      given_name: form.querySelector('#pf-given').value.trim(),
      surname: form.querySelector('#pf-surname').value.trim(),
      gender: form.querySelector('#pf-gender').value,
      notes: form.querySelector('#pf-notes').value.trim(),
    };

    try {
      if (isEdit) {
        await people.update(personId, data);
        close();
        emit(DATA_CHANGED);
        showToast('Person updated');
      } else {
        const created = await people.create(data);
        close();
        emit(DATA_CHANGED);
        showToast(`Created ${data.given_name || 'person'}`);
        onCreated?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  // Focus first input
  setTimeout(() => form.querySelector('#pf-given').focus(), 50);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
