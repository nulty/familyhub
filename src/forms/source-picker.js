/**
 * source-picker.js — Reusable search-as-you-type source selector
 */

import { sources } from '../db/db.js';
import { openSourceForm } from './source-form.js';

/**
 * @param {Object} opts
 * @param {function} opts.onSelect - called with source object
 * @param {string[]} [opts.excludeIds] - IDs to exclude from results
 * @returns {HTMLElement}
 */
export function createSourcePicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'person-picker'; // reuse picker styles

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search sources...';
  input.autocomplete = 'off';

  const results = document.createElement('div');
  results.className = 'picker-results';
  results.style.display = 'none';

  wrapper.appendChild(input);
  wrapper.appendChild(results);

  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => doSearch(input.value.trim()), 200);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch(input.value.trim());
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) results.style.display = 'none';
  });

  async function doSearch(query) {
    const list = await sources.search(query);
    const filtered = list.filter(s => !excludeIds.includes(s.id));

    results.innerHTML = '';

    if (filtered.length === 0 && !query) {
      results.style.display = 'none';
      return;
    }

    for (const s of filtered.slice(0, 20)) {
      const div = document.createElement('div');
      div.className = 'picker-result';
      div.textContent = s.title + (s.repository_name ? ` (${s.repository_name})` : '');
      div.onclick = () => {
        results.style.display = 'none';
        input.value = s.title;
        onSelect(s);
      };
      results.appendChild(div);
    }

    // "Create new" option
    const create = document.createElement('div');
    create.className = 'picker-create';
    create.textContent = '+ Create new source...';
    create.onclick = () => {
      results.style.display = 'none';
      openSourceForm(null, (newSource) => {
        input.value = newSource.title;
        onSelect(newSource);
      });
    };
    results.appendChild(create);

    results.style.display = 'block';
  }

  wrapper.focus = () => {
    setTimeout(() => input.focus(), 50);
  };

  return wrapper;
}
