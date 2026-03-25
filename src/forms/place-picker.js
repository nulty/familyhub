/**
 * place-picker.js — Reusable search-as-you-type place selector
 */

import { places } from '../db/db.js';
import { openPlaceForm } from './place-form.js';

/**
 * @param {Object} opts
 * @param {function} opts.onSelect - called with place object
 * @param {string[]} [opts.excludeIds] - IDs to exclude from results
 * @returns {HTMLElement}
 */
export function createPlacePicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'person-picker'; // reuse picker styles

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search places...';
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
    const list = await places.search(query);
    const filtered = list.filter(p => !excludeIds.includes(p.id));

    results.innerHTML = '';

    if (filtered.length === 0 && !query) {
      results.style.display = 'none';
      return;
    }

    for (const p of filtered.slice(0, 20)) {
      const div = document.createElement('div');
      div.className = 'picker-result';
      div.textContent = (p.full_name || p.name) + (p.type ? ` (${p.type})` : '');
      div.onclick = () => {
        results.style.display = 'none';
        input.value = p.name;
        onSelect(p);
      };
      results.appendChild(div);
    }

    // "Create new" option
    const create = document.createElement('div');
    create.className = 'picker-create';
    create.textContent = '+ Create new place...';
    create.onclick = () => {
      results.style.display = 'none';
      openPlaceForm(null, (newPlace) => {
        input.value = newPlace.name;
        onSelect(newPlace);
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
