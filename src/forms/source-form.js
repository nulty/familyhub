/**
 * source-form.js — Modal form for create/edit source
 */

import { sources, repositories } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';
import { openRepositoryForm } from './repository-form.js';

const SOURCE_TYPES = [
  { value: '', label: '(unspecified)' },
  { value: 'document', label: 'Document' },
  { value: 'register', label: 'Register' },
  { value: 'census', label: 'Census' },
  { value: 'webpage', label: 'Webpage' },
  { value: 'book', label: 'Book' },
  { value: 'newspaper', label: 'Newspaper' },
  { value: 'certificate', label: 'Certificate' },
  { value: 'photograph', label: 'Photograph' },
  { value: 'other', label: 'Other' },
];

/**
 * @param {string} [sourceId] — if provided, edit mode
 * @param {function} [onComplete] — callback with source when created/updated
 */
/**
 * @param {string} [sourceId] — if provided, edit mode
 * @param {function} [onComplete] — callback with source when created/updated
 * @param {Object} [prefill] — prefill values for new source (e.g. { repository_id, repository_name })
 */
export async function openSourceForm(sourceId, onComplete, prefill) {
  const isEdit = !!sourceId;
  let existing = null;

  if (isEdit) {
    existing = await sources.get(sourceId);
    if (!existing) return;
  }

  let selectedRepoId = existing?.repository_id || prefill?.repository_id || null;

  const form = document.createElement('form');
  form.innerHTML = `
    <div class="form-group">
      <label for="sf-title">Title</label>
      <input id="sf-title" type="text" value="${esc(existing?.title || '')}" autocomplete="off">
      <span class="form-hint">The collection or publication — e.g. "IrishGenealogy.ie — Civil Birth Records", "1901 Census Online"</span>
    </div>
    <div class="form-group">
      <label for="sf-type">Type</label>
      <select id="sf-type">
        ${SOURCE_TYPES.map(t => `<option value="${t.value}" ${existing?.type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
      </select>
    </div>
    <div class="form-group" style="position:relative">
      <label for="sf-repo">Repository</label>
      <input id="sf-repo" type="text" value="${esc(existing?.repository_name || prefill?.repository_name || '')}" placeholder="Search repositories..." autocomplete="off">
      <div id="sf-repo-suggestions" class="place-suggestions"></div>
      <button type="button" class="btn btn-sm btn-link" id="sf-new-repo">+ New repository</button>
      <span class="form-hint">The organisation that holds the original records</span>
    </div>
    <div class="form-group">
      <label for="sf-url">URL</label>
      <input id="sf-url" type="text" value="${esc(existing?.url || '')}" placeholder="https://..." autocomplete="off">
      <span class="form-hint">Base URL of the online collection (specific record links go on citations)</span>
    </div>
    <div class="form-group">
      <label for="sf-author">Author</label>
      <input id="sf-author" type="text" value="${esc(existing?.author || '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="sf-publisher">Publisher</label>
      <input id="sf-publisher" type="text" value="${esc(existing?.publisher || '')}" autocomplete="off">
    </div>
    <div class="form-group">
      <label for="sf-year">Year</label>
      <input id="sf-year" type="text" value="${esc(existing?.year || '')}" placeholder="e.g. 1901" autocomplete="off" style="width:120px">
    </div>
    <div class="form-group">
      <label for="sf-notes">Notes</label>
      <textarea id="sf-notes" rows="2">${esc(existing?.notes || '')}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn" data-action="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `;

  const title = isEdit ? `Edit Source` : 'New Source';
  const { close } = openModal({ title, content: form });

  // Repository autocomplete
  const repoInput = form.querySelector('#sf-repo');
  const repoSuggestions = form.querySelector('#sf-repo-suggestions');
  let repoTimer = null;

  repoInput.addEventListener('input', () => {
    selectedRepoId = null;
    clearTimeout(repoTimer);
    const q = repoInput.value.trim();
    if (!q) { repoSuggestions.innerHTML = ''; repoSuggestions.style.display = 'none'; return; }
    repoTimer = setTimeout(async () => {
      const results = await repositories.search(q);
      repoSuggestions.innerHTML = '';
      for (const r of results) {
        const div = document.createElement('div');
        div.className = 'place-suggestion';
        div.textContent = r.name + (r.type ? ` (${r.type})` : '');
        div.onclick = () => {
          repoInput.value = r.name;
          selectedRepoId = r.id;
          repoSuggestions.style.display = 'none';
        };
        repoSuggestions.appendChild(div);
      }
      repoSuggestions.style.display = 'block';
    }, 200);
  });

  document.addEventListener('click', (e) => {
    if (!repoInput.contains(e.target) && !repoSuggestions.contains(e.target)) {
      repoSuggestions.style.display = 'none';
    }
  });

  form.querySelector('#sf-new-repo').onclick = () => {
    openRepositoryForm(null, (newRepo) => {
      repoInput.value = newRepo.name;
      selectedRepoId = newRepo.id;
    });
  };

  form.querySelector('[data-action="cancel"]').onclick = close;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
      title: form.querySelector('#sf-title').value.trim(),
      type: form.querySelector('#sf-type').value,
      repository_id: selectedRepoId,
      url: form.querySelector('#sf-url').value.trim(),
      author: form.querySelector('#sf-author').value.trim(),
      publisher: form.querySelector('#sf-publisher').value.trim(),
      year: form.querySelector('#sf-year').value.trim(),
      notes: form.querySelector('#sf-notes').value.trim(),
    };

    if (!data.title) {
      showToast('Title is required');
      return;
    }

    try {
      if (isEdit) {
        const updated = await sources.update(sourceId, data);
        close();
        emit(DATA_CHANGED);
        showToast('Source updated');
        onComplete?.(updated);
      } else {
        const created = await sources.create(data);
        close();
        emit(DATA_CHANGED);
        showToast(`Created ${data.title}`);
        onComplete?.(created);
      }
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  };

  setTimeout(() => form.querySelector('#sf-title').focus(), 50);
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
