/**
 * search.js — Global search dropdown
 */

import { people } from '../db/db.js';
import { emit, PERSON_SELECTED } from '../state.js';
import { focusPerson } from './tree.js';

export function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) {
      results.classList.remove('open');
      return;
    }
    timer = setTimeout(() => doSearch(q), 200);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim() && results.children.length > 0) {
      results.classList.add('open');
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.classList.remove('open');
    }
  });

  async function doSearch(query) {
    const list = await people.search(query);
    results.innerHTML = '';

    if (list.length === 0) {
      results.innerHTML = '<div class="search-result" style="color:var(--text-muted)">No results</div>';
      results.classList.add('open');
      return;
    }

    for (const p of list.slice(0, 15)) {
      const name = [p.given_name, p.surname].filter(Boolean).join(' ') || 'Unnamed';
      const div = document.createElement('div');
      div.className = 'search-result';
      div.innerHTML = `<span class="search-result-name">${esc(name)}</span>`;
      div.onclick = () => {
        results.classList.remove('open');
        input.value = '';
        focusPerson(p.id);
        emit(PERSON_SELECTED, p.id);
      };
      results.appendChild(div);
    }

    results.classList.add('open');
  }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
