/**
 * repository-form.js — Modal form for create/edit repository
 */

import { repositories } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

const REPO_TYPES = [
  { value: '', label: '(unspecified)' },
  { value: 'government', label: 'Government Office' },
  { value: 'archive', label: 'Archive' },
  { value: 'church', label: 'Church' },
  { value: 'library', label: 'Library' },
  { value: 'website', label: 'Website' },
  { value: 'database', label: 'Online Database' },
  { value: 'personal', label: 'Personal Collection' },
  { value: 'other', label: 'Other' },
];

/**
 * @param {string} [repoId] — if provided, edit mode
 * @param {function} [onComplete] — callback with repository when created/updated
 */
export async function openRepositoryForm(repoId, onComplete) {
  const isEdit = !!repoId;
  let existing = null;

  if (isEdit) {
    existing = await repositories.get(repoId);
    if (!existing) return;
  }

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group">
      <label for="rf-name">Name</label>
      <input id="rf-name" type="text" value="${esc(existing?.name || '')}" autocomplete="off">
      <span class="form-hint">The organisation that holds the original records — e.g. "General Register Office", "St Mary's Parish"</span>
    </div>
    <div class="form-group">
      <label for="rf-type">Type</label>
      <select id="rf-type">
        ${REPO_TYPES.map(t => `<option value="${t.value}" ${existing?.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label for="rf-url">URL</label>
      <input id="rf-url" type="text" value="${esc(existing?.url || '')}" placeholder="https://..." autocomplete="off">
      <span class="form-hint">Website of the repository itself (if any)</span>
    </div>
    <div class="form-group">
      <label for="rf-address">Address</label>
      <textarea id="rf-address" rows="2" placeholder="Physical address">${esc(existing?.address || '')}</textarea>
    </div>
    <div class="form-group">
      <label for="rf-notes">Notes</label>
      <textarea id="rf-notes" rows="2">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? `Edit ${existing.name}` : 'New Repository';
  const { close } = openModal({ title, content: form });

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      name: form.querySelector('#rf-name').value.trim(),
      type: form.querySelector('#rf-type').value,
      url: form.querySelector('#rf-url').value.trim(),
      address: form.querySelector('#rf-address').value.trim(),
      notes: form.querySelector('#rf-notes').value.trim(),
    };

    if (!data.name) {
      showToast('Name is required');
      return;
    }

    try {
      if (isEdit) {
        const updated = await repositories.update(repoId, data);
        close();
        emit(DATA_CHANGED);
        showToast('Repository updated');
        onComplete?.(updated);
      } else {
        const created = await repositories.create(data);
        close();
        emit(DATA_CHANGED);
        showToast(`Created ${data.name}`);
        onComplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  setTimeout(() => form.querySelector('#rf-name').focus(), 50);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
