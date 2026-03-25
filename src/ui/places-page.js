/**
 * places-page.js — Place management modal with tree view
 */

import { places } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import { openPlaceForm } from '../forms/place-form.js';
import { openOrganizeWizard } from './places-organize.js';

export async function openPlacesPage() {
  const content = document.createElement('div');
  content.className = 'places-page';

  const { close, body } = openModal({ title: 'Places', content });

  await renderPlaces(body);
}

async function renderPlaces(container) {
  const allPlaces = await places.tree();

  // Build tree structure
  const byParent = {};
  for (const p of allPlaces) {
    const key = p.parent_id || '__root__';
    if (!byParent[key]) byParent[key] = [];
    byParent[key].push(p);
  }

  const inner = container.querySelector('.places-page') || container;
  inner.innerHTML = '';

  // Action buttons
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-bottom:12px';

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary btn-sm';
  addBtn.textContent = '+ Add Place';
  addBtn.onclick = () => openPlaceForm(null, () => renderPlaces(container));
  actions.appendChild(addBtn);

  const organizeBtn = document.createElement('button');
  organizeBtn.className = 'btn btn-sm';
  organizeBtn.textContent = 'Organize';
  organizeBtn.onclick = () => openOrganizeWizard(() => renderPlaces(container));
  actions.appendChild(organizeBtn);

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn btn-sm';
  exportBtn.textContent = 'Export';
  exportBtn.onclick = async () => {
    const all = await places.list();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'places.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Places exported');
  };
  actions.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'btn btn-sm';
  importBtn.textContent = 'Import';
  importBtn.onclick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) { showToast('Invalid format — expected an array'); return; }
        // Build insertion order: roots first, then children, resolving parent IDs
        const idMap = {}; // old ID → new ID
        const sorted = [];
        const remaining = [...data];
        // Topological sort: insert places whose parent is null or already inserted
        while (remaining.length > 0) {
          const batch = remaining.filter(p => !p.parent_id || idMap[p.parent_id]);
          if (batch.length === 0) { sorted.push(...remaining); break; } // circular or orphans
          sorted.push(...batch);
          for (const p of batch) remaining.splice(remaining.indexOf(p), 1);
        }
        let count = 0;
        let skipped = 0;
        for (const p of sorted) {
          try {
            const newParentId = p.parent_id ? (idMap[p.parent_id] || null) : null;
            // Check if a place with the same name, type, and parent already exists
            const existing = await places.search(p.name);
            const match = existing.find(e => e.name === p.name && e.type === (p.type || '') && (e.parent_id || null) === newParentId);
            if (match) {
              idMap[p.id] = match.id;
              skipped++;
              continue;
            }
            const created = await places.create({ name: p.name, type: p.type || '', parent_id: newParentId, notes: p.notes || '' });
            idMap[p.id] = created.id;
            count++;
          } catch { /* skip errors */ }
        }
        emit(DATA_CHANGED);
        showToast(`Imported ${count} places${skipped ? `, ${skipped} already existed` : ''}`);
        renderPlaces(container);
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    };
    input.click();
  };
  actions.appendChild(importBtn);

  inner.appendChild(actions);

  if (allPlaces.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'section-empty';
    empty.textContent = 'No places yet. Add one or import a GEDCOM file.';
    inner.appendChild(empty);
    return;
  }

  // Render tree
  const tree = renderTree(byParent, '__root__', container);
  inner.appendChild(tree);
}

function renderTree(byParent, parentKey, rootContainer) {
  const items = byParent[parentKey] || [];
  if (items.length === 0) return document.createDocumentFragment();

  const ul = document.createElement('ul');
  ul.className = 'place-tree';

  for (const place of items) {
    const hasChildren = byParent[place.id]?.length > 0;
    const li = document.createElement('li');
    li.className = 'place-tree-item';

    const row = document.createElement('div');
    row.className = 'place-tree-row';

    if (hasChildren) {
      const toggle = document.createElement('span');
      toggle.className = 'place-toggle';
      toggle.textContent = '\u25B6'; // ▶
      toggle.onclick = () => {
        const children = li.querySelector('.place-tree');
        if (children) {
          const open = children.style.display !== 'none';
          children.style.display = open ? 'none' : 'block';
          toggle.textContent = open ? '\u25B6' : '\u25BC'; // ▶ / ▼
        }
      };
      row.appendChild(toggle);
    } else {
      const spacer = document.createElement('span');
      spacer.className = 'place-toggle-spacer';
      row.appendChild(spacer);
    }

    const name = document.createElement('span');
    name.className = 'place-tree-name';
    name.textContent = place.name;
    row.appendChild(name);

    if (place.type) {
      const badge = document.createElement('span');
      badge.className = 'place-type-badge';
      badge.textContent = place.type;
      row.appendChild(badge);
    }

    const actions = document.createElement('span');
    actions.className = 'place-tree-actions';

    const editBtn = document.createElement('button');
    editBtn.className = 'btn-link btn-sm';
    editBtn.textContent = 'edit';
    editBtn.onclick = (e) => {
      e.stopPropagation();
      openPlaceForm(place.id, () => renderPlaces(rootContainer));
    };
    actions.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-link btn-sm';
    deleteBtn.style.color = 'var(--danger)';
    deleteBtn.textContent = 'delete';
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete "${place.name}"? Children will become root places.`)) return;
      await places.delete(place.id);
      emit(DATA_CHANGED);
      showToast(`Deleted ${place.name}`);
      renderPlaces(rootContainer);
    };
    actions.appendChild(deleteBtn);

    row.appendChild(actions);
    li.appendChild(row);

    // Render children (collapsed by default)
    if (hasChildren) {
      const childTree = renderTree(byParent, place.id, rootContainer);
      childTree.querySelector('.place-tree').style.display = 'none';
      li.appendChild(childTree.querySelector('.place-tree'));
    }

    ul.appendChild(li);
  }

  const frag = document.createDocumentFragment();
  frag.appendChild(ul);
  return frag;
}
