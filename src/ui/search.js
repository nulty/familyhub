/**
 * search.js — Bridge: mounts Svelte Search component into the header.
 */
import { mount } from 'svelte';
import Search from '../lib/components/Search.svelte';

export function initSearch() {
  const existing = document.getElementById('search-wrapper');
  if (!existing) return;

  const parent = existing.parentElement;
  const next = existing.nextSibling;
  existing.remove();

  const container = document.createElement('div');
  if (next) parent.insertBefore(container, next);
  else parent.appendChild(container);

  mount(Search, { target: container });
}
