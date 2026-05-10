/**
 * places-organize.js — Wizard to structure flat imported places into a hierarchy
 */

import { places, placeTypes } from '../db/db.js';
import { emit, DATA_CHANGED } from '../state.js';
import { openPlaceForm } from '../lib/shared/open.js';
import { showToast } from '../lib/shared/toast-store.js';
import { groupTypes } from '../util/place-type-seeds.js';
import TomSelect from 'tom-select';
import 'tom-select/dist/css/tom-select.css';

/** Minimal imperative modal for the organize wizard (last vanilla consumer). */
function openModal({ title, content, onclose }) {
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `<h2>${title || ''}</h2><button class="modal-close" aria-label="Close">&times;</button>`;
  const body = document.createElement('div');
  body.className = 'modal-body';
  if (content instanceof Node) body.appendChild(content);
  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  root.appendChild(backdrop);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    onclose?.();
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
  }
  header.querySelector('.modal-close').onclick = close;
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  function onKey(e) { if (e.key === 'Escape') close(); }
  window.addEventListener('keydown', onKey);
  return { close, body };
}

/**
 * Vanilla confirm dialog backed by openModal — stacks correctly above the
 * wizard backdrop in #modal-root. Returns a Promise<boolean>.
 */
function openVanillaConfirm({ title, message, confirm = 'Confirm', cancel = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const content = document.createElement('div');
    content.className = 'inline-confirm';
    content.innerHTML = `
      <p class="inline-confirm-message">${esc(message)}</p>
      <div class="form-actions">
        <button type="button" class="btn btn-sm" data-act="cancel">${esc(cancel)}</button>
        <button type="button" class="btn btn-sm ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${esc(confirm)}</button>
      </div>
    `;
    const { close } = openModal({ title, content, onclose: () => resolve(result) });
    content.querySelector('[data-act="cancel"]').onclick = () => { result = false; close(); };
    content.querySelector('[data-act="ok"]').onclick = () => { result = true; close(); };
  });
}
import { getConfig, setConfig } from '../config.js';

// Persist resolved segments across wizard sessions
function getResolvedSegments() {
  return getConfig('resolvedPlaceSegments', {});
}
function saveResolvedSegment(originalName, placeId) {
  const resolved = getResolvedSegments();
  resolved[originalName] = placeId;
  setConfig('resolvedPlaceSegments', resolved);
}

// Persist skipped segments across wizard sessions
function getSkippedSegments() {
  return getConfig('skippedPlaceSegments', []);
}
function saveSkippedSegment(name) {
  const skipped = getSkippedSegments();
  if (!skipped.includes(name)) {
    skipped.push(name);
    setConfig('skippedPlaceSegments', skipped);
  }
}

/**
 * @returns {{ resolved: number, skipped: number }} progress counts.
 */
export function getManualStructureProgress() {
  return {
    resolved: Object.keys(getResolvedSegments()).length,
    skipped: getSkippedSegments().length,
  };
}

/**
 * Clear the wizard's persisted resolved and skipped segments, so the next run
 * starts from scratch. Does not touch the place records themselves.
 */
export function resetManualStructure() {
  setConfig('resolvedPlaceSegments', {});
  setConfig('skippedPlaceSegments', []);
}

export async function openOrganizeWizard(onComplete) {
  const [allPlaces, fetchedTypes] = await Promise.all([places.list(), placeTypes.list()]);

  // Places that need organizing: comma-separated (not yet split) OR no type set
  const unorganizedPlaces = allPlaces.filter(p => p.name.includes(',') || !p.type);

  if (unorganizedPlaces.length === 0) {
    showToast('No places to structure — all places are already typed and split');
    return;
  }

  // Extract unique segments from comma-separated names + standalone untyped places
  const segmentCounts = {};
  for (const p of unorganizedPlaces) {
    const parts = p.name.split(',').map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (!segmentCounts[part]) segmentCounts[part] = { name: part, count: 0, placeIds: [], examples: [] };
      segmentCounts[part].count++;
      segmentCounts[part].placeIds.push(p.id);
      if (segmentCounts[part].examples.length < 5) {
        segmentCounts[part].examples.push(p.name);
      }
    }
  }

  // Pre-populate categorized with segments that already exist as organized place records
  // Only count a place as "already categorized" if it has a type set
  const categorized = {};
  const organizedPlaces = allPlaces.filter(p => !p.name.includes(',') && p.type);
  for (const seg of Object.values(segmentCounts)) {
    const match = organizedPlaces.find(p => p.name === seg.name);
    if (match) {
      categorized[seg.name] = {
        editedName: match.name,
        type: match.type,
        parentName: null,
      };
    }
  }

  // Load previously resolved segments (persisted across wizard sessions)
  const resolved = getResolvedSegments();
  for (const seg of Object.values(segmentCounts)) {
    if (resolved[seg.name] && !categorized[seg.name]) {
      categorized[seg.name] = {
        editedName: seg.name,
        type: '',
        parentName: null,
        resolved: true,
      };
    }
  }

  // Load previously skipped segments
  const skipped = getSkippedSegments();
  for (const seg of Object.values(segmentCounts)) {
    if (skipped.includes(seg.name) && !categorized[seg.name]) {
      categorized[seg.name] = {
        editedName: seg.name,
        type: '',
        parentName: null,
        skipped: true,
      };
    }
  }

  // Sort by frequency (most common first)
  const segments = Object.values(segmentCounts).sort((a, b) => b.count - a.count);
  let currentIndex = 0;

  // Persistent map: segment name → place ID (survives across categorize clicks)
  const segmentToPlaceId = {};

  // History of actions taken this session
  const history = [];

  // Pre-populate segmentToPlaceId from existing organized places (must have type set)
  for (const ep of organizedPlaces) {
    segmentToPlaceId[ep.name] = ep.id;
  }

  function buildPlaceOptions() {
    // Merge organized DB places + in-session categorized entries, deduplicated by name+type
    const seen = new Set();
    const options = [];
    for (const ep of organizedPlaces) {
      const key = `${ep.name}::${ep.type}`;
      if (!seen.has(key)) {
        seen.add(key);
        options.push({ name: ep.name, type: ep.type, id: ep.id });
      }
    }
    for (const [orig, c] of Object.entries(categorized)) {
      const name = c.editedName || orig;
      const key = `${name}::${c.type}`;
      if (!seen.has(key) && c.type) {
        seen.add(key);
        options.push({ name, type: c.type });
      }
    }
    return options.sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  }

  function renderHistory() {
    if (history.length === 0) return '';
    return `<details class="organize-history" open>
      <summary>History (${history.length})</summary>
      <div class="organize-history-list">
        ${[...history].reverse().map(h => `<div class="organize-history-item">${esc(h)}</div>`).join('')}
      </div>
    </details>`;
  }

  const content = document.createElement('div');
  content.className = 'organize-wizard';

  let parentTS = null;
  let mergeTS = null;
  function destroyTomSelects() {
    parentTS?.destroy();
    mergeTS?.destroy();
    parentTS = null;
    mergeTS = null;
  }

  const { close } = openModal({
    title: 'Manual structure',
    content,
    onclose: destroyTomSelects,
  });

  async function render() {
    destroyTomSelects();
    // Filter out already-categorized segments
    const remaining = segments.filter(s => !categorized[s.name]);

    if (remaining.length === 0 || currentIndex >= segments.length) {
      renderDone();
      return;
    }

    // Show next uncategorized segment
    const seg = remaining[0];

    // Fetch associated people for context
    let peopleHtml = '';
    const people = await places.people(seg.name);
    if (people.length > 0) {
      const names = people.map(p => [p.given_name, p.surname].filter(Boolean).join(' ')).join(', ');
      peopleHtml = `<div class="organize-people">Associated with: ${esc(names)}</div>`;
    }

    // Try to infer parent from context — look at place names containing this segment
    // and see which other segments co-occur at a higher level
    const coOccurring = findCoOccurring(seg, allPlaces);

    const persistedCount = Object.values(categorized).filter(c => c.resolved || c.skipped).length;
    content.innerHTML = `
      <p class="organize-intro">
        Use this for places Geocode couldn't find — historic addresses, defunct townlands,
        old farms, or anything Nominatim doesn't know about. For each segment found in your
        flat place names, set its type and parent so it joins the hierarchy correctly.
      </p>
      <div class="organize-progress-row">
        <span class="organize-progress">
          ${Object.keys(categorized).length} of ${segments.length} segments categorized
        </span>
        ${persistedCount > 0
          ? `<button type="button" id="org-reset" class="btn btn-sm btn-subtle">Reset progress</button>`
          : ''}
      </div>
      <div class="organize-card">
        ${peopleHtml}
        <div class="form-group">
          <label>Name</label>
          <input id="org-name" type="text" value="${esc(seg.name)}" autocomplete="off">
        </div>
        <p class="organize-count">Found in ${seg.count} place${seg.count !== 1 ? 's' : ''}</p>
        <div class="organize-examples">
          ${[...new Set(seg.examples)].map(ex => `<div class="organize-example">${esc(ex)}</div>`).join('')}
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="org-type">
            <option value="">(skip — not a place)</option>
            ${groupTypes(fetchedTypes).map(g =>
              `<optgroup label="${esc(g.label)}">` +
              g.types.map(t => `<option value="${t.key}">${esc(t.label)}</option>`).join('') +
              `</optgroup>`
            ).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Parent place</label>
          <div class="organize-select-row">
            <select id="org-parent">
              <option value="">(none — top level)</option>
              ${buildPlaceOptions().map(c => `<option value="${c.id || c.name}" data-name="${c.name}">${c.name}${c.type ? ' (' + c.type.replace(/_/g, ' ') + ')' : ''}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm" id="org-create-parent">+ New</button>
          </div>
        </div>
        <div class="form-group">
          <label>Or match to existing place</label>
          <div class="organize-select-row">
            <select id="org-merge">
              <option value="">(don't merge)</option>
              ${buildPlaceOptions().map(c => `<option value="${c.id || c.name}" data-name="${c.name}">${c.name}${c.type ? ' (' + c.type.replace(/_/g, ' ') + ')' : ''}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="organize-actions">
          <button class="btn btn-sm" id="org-skip">Skip</button>
          <button class="btn btn-sm btn-primary" id="org-categorize">Categorize</button>
        </div>
      </div>
      ${renderHistory()}
    `;

    const tsCommonOpts = {
      maxItems: 1,
      allowEmptyOption: true,
      searchField: ['text'],
      maxOptions: 200,
    };
    parentTS = new TomSelect(content.querySelector('#org-parent'), tsCommonOpts);
    mergeTS = new TomSelect(content.querySelector('#org-merge'), tsCommonOpts);

    const placeOptionsList = buildPlaceOptions();
    const idToName = new Map();
    for (const c of placeOptionsList) {
      idToName.set(c.id || c.name, c.name);
    }

    const resetBtn = content.querySelector('#org-reset');
    if (resetBtn) {
      resetBtn.onclick = async () => {
        if (resetBtn.disabled) return;
        resetBtn.disabled = true;
        try {
          const ok = await openVanillaConfirm({
            title: 'Reset manual structure progress?',
            message: 'This forgets which segments you\'ve already categorized or skipped, so the wizard will re-ask about all of them. Place records you\'ve already created or edited are not affected.',
            confirm: 'Reset',
            danger: true,
          });
          if (!ok) return;
          doReset();
        } finally {
          resetBtn.disabled = false;
        }
      };

      function doReset() {
        resetManualStructure();
        // Wipe in-memory wizard state
        for (const k of Object.keys(categorized)) delete categorized[k];
        history.length = 0;
        // Re-derive the entries that come from real DB places (still typed, still valid)
        for (const seg of Object.values(segmentCounts)) {
          const match = organizedPlaces.find(p => p.name === seg.name);
          if (match) {
            categorized[seg.name] = { editedName: match.name, type: match.type, parentName: null };
          }
        }
        currentIndex = 0;
        showToast('Manual structure progress cleared');
        render();
      };
    }

    content.querySelector('#org-create-parent').onclick = () => {
      openPlaceForm(null, (newPlace) => {
        categorized[newPlace.name] = {
          editedName: newPlace.name,
          type: newPlace.type || '',
          parentName: null,
        };
        segmentToPlaceId[newPlace.name] = newPlace.id;
        organizedPlaces.push({ id: newPlace.id, name: newPlace.name, type: newPlace.type || '' });
        idToName.set(newPlace.id, newPlace.name);
        const text = newPlace.name + (newPlace.type ? ` (${newPlace.type.replace(/_/g, ' ')})` : '');
        parentTS?.addOption({ value: newPlace.id, text });
        parentTS?.refreshOptions(false);
        parentTS?.addItem(newPlace.id);
      });
    };

    content.querySelector('#org-skip').onclick = () => {
      currentIndex++;
      saveSkippedSegment(seg.name);
      categorized[seg.name] = { editedName: seg.name, type: '', parentName: null, skipped: true };
      history.push(`${seg.name} — skipped`);
      render();
    };

    content.querySelector('#org-categorize').onclick = async () => {
      const mergeValue = mergeTS?.getValue() || '';
      const mergeName = mergeValue ? (idToName.get(mergeValue) || mergeValue) : '';

      // If merge target selected, map this segment to that place
      if (mergeValue) {
        // The value is a place ID or a name — try as ID first, then by name
        let targetId = mergeValue;
        // Verify it's a real place ID
        if (!Object.values(segmentToPlaceId).includes(targetId)) {
          // Try as a name lookup
          targetId = segmentToPlaceId[mergeValue] || segmentToPlaceId[mergeName];
        }
        if (targetId) {
          segmentToPlaceId[seg.name] = targetId;
          saveResolvedSegment(seg.name, targetId);
          categorized[seg.name] = { editedName: mergeName || mergeValue, type: '', mergedTo: mergeValue };
          await restructureFlatPlaces(seg.name);
          history.push(`${seg.name} → merged to ${mergeName || mergeValue}`);
          showToast(`Merged "${seg.name}" → "${mergeName || mergeValue}"`);
        } else {
          showToast(`Could not find place to merge into`);
        }
        currentIndex++;
        render();
        return;
      }

      // No merge — create/update as a new place
      const editedName = content.querySelector('#org-name').value.trim();
      const type = content.querySelector('#org-type').value;
      const parentValue = parentTS?.getValue() || '';
      const parentName = parentValue ? (idToName.get(parentValue) || parentValue) : '';

      if (!type) {
        // Skip — no type selected
        currentIndex++;
        render();
        return;
      }

      if (!editedName) {
        showToast('Name is required');
        return;
      }

      // Commit to DB immediately
      // parentValue is a place ID (or name fallback), resolve to an ID
      const parentId = parentValue ? (segmentToPlaceId[parentName] || segmentToPlaceId[parentValue] || parentValue) : null;
      const existing = await places.search(editedName);
      const match = existing.find(p => p.name === editedName);

      let placeId;
      if (match) {
        await places.update(match.id, { type, parent_id: parentId });
        placeId = match.id;
      } else {
        const created = await places.create({ name: editedName, type, parent_id: parentId });
        placeId = created.id;
      }

      segmentToPlaceId[seg.name] = placeId;
      saveResolvedSegment(seg.name, placeId);
      if (editedName !== seg.name) {
        segmentToPlaceId[editedName] = placeId;
        saveResolvedSegment(editedName, placeId);
      }
      categorized[seg.name] = { editedName, type, parentName };

      // Restructure flat places that contain this segment
      await restructureFlatPlaces(seg.name);

      const parentLabel = parentName ? ` → ${parentName}` : '';
      history.push(`${editedName} (${type.replace(/_/g, ' ')})${parentLabel}`);
      showToast(`Saved "${editedName}" as ${type.replace(/_/g, ' ')}`);
      currentIndex++;
      render();
    };

  }

  function findCoOccurring(seg, allPlaces) {
    // Find other segments that appear alongside this one, that have been categorized
    const result = [];
    for (const p of allPlaces) {
      const parts = p.name.split(',').map(s => s.trim());
      const idx = parts.indexOf(seg.name);
      if (idx === -1) continue;
      // Parts to the right are "higher" in hierarchy (more general)
      for (let i = idx + 1; i < parts.length; i++) {
        const cat = categorized[parts[i]];
        const displayName = cat?.editedName || parts[i];
        if (cat && !result.find(r => r.name === displayName)) {
          result.push({ name: displayName, type: cat.type });
        }
      }
    }
    return result;
  }

  async function restructureFlatPlaces(segmentName) {
    // After committing a segment, update all flat places that contain it
    const cat = categorized[segmentName];
    const editedName = cat?.editedName || segmentName;
    const currentPlaces = await places.list();

    for (const p of currentPlaces) {
      const parts = p.name.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length <= 1) continue; // already atomic
      if (!parts.includes(segmentName)) continue;

      // The leaf is the leftmost part
      let leafName = parts[0];
      // If the segment we just categorized IS the leaf, use the edited name
      if (leafName === segmentName) leafName = editedName;

      let parentId = null;
      // Walk from general to specific (right to left), find nearest categorized parent
      for (let i = parts.length - 1; i >= 1; i--) {
        if (segmentToPlaceId[parts[i]]) {
          parentId = segmentToPlaceId[parts[i]];
          break;
        }
      }

      // If the categorized segment is NOT the leaf, it's a parent — link the leaf to it
      if (parts[0] !== segmentName && !parentId) {
        parentId = segmentToPlaceId[segmentName] || null;
      }

      if (parentId) {
        await places.update(p.id, { name: leafName, parent_id: parentId });
      }
    }
    emit(DATA_CHANGED);
  }

  function renderDone() {
    const catCount = Object.keys(categorized).length;
    content.innerHTML = `
      <div class="organize-card">
        <h3>Done</h3>
        <p>${catCount} segment${catCount !== 1 ? 's' : ''} organized.</p>
        <div class="organize-actions">
          <button class="btn btn-sm btn-primary" id="org-close">Close</button>
        </div>
      </div>
    `;
    content.querySelector('#org-close').onclick = () => {
      close();
      onComplete?.();
    };
  }

  render();
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
