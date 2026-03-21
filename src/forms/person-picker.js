/**
 * person-picker.js — Reusable search-as-you-type person selector
 */

import { people } from '../db/db.js';
import { openPersonForm } from './person-form.js';

/**
 * @param {Object} opts
 * @param {function} opts.onSelect - called with person object
 * @param {string[]} [opts.excludeIds] - IDs to exclude from results
 * @returns {HTMLElement}
 */
export function createPersonPicker({ onSelect, excludeIds = [] }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'person-picker';

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Search by name...';
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

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) results.style.display = 'none';
  });

  async function doSearch(query) {
    const list = await people.search(query);
    const filtered = list.filter(p => !excludeIds.includes(p.id));

    results.innerHTML = '';

    if (filtered.length === 0 && !query) {
      results.style.display = 'none';
      return;
    }

    for (const p of filtered.slice(0, 20)) {
      const name = [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
      const div = document.createElement('div');
      div.className = 'picker-result';
      div.textContent = name;
      div.onclick = () => {
        results.style.display = 'none';
        input.value = name;
        onSelect(p);
      };
      results.appendChild(div);
    }

    // "Create new" option
    const create = document.createElement('div');
    create.className = 'picker-create';
    create.textContent = '+ Create new person...';
    create.onclick = () => {
      results.style.display = 'none';
      openPersonForm(null, (newPerson) => {
        const name = [newPerson.given_name, newPerson.surname].filter(Boolean).join(' ') || 'Unnamed';
        input.value = name;
        onSelect(newPerson);
      });
    };
    results.appendChild(create);

    results.style.display = 'block';
  }

  // Allow trigger from outside
  wrapper.focus = () => {
    setTimeout(() => input.focus(), 50);
  };

  return wrapper;
}
