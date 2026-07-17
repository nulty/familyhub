/**
 * places-organize.js — Wizard to structure flat imported places into a hierarchy
 */

import { places, placeTypes, events } from '../db/db.js';
import { emit, DATA_CHANGED, PICK_LOCATION } from '../state.js';
import { showToast } from '../lib/shared/toast-store.js';
import { groupTypes } from '../util/place-type-seeds.js';
import { geocodeSearch } from '../util/geocode.js';
import { GeocodeQueue } from '../util/geocode-queue.js';
import { getTreeId } from '../config.js';
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
  function onKey(e) {
    if (e.key !== 'Escape') return;
    // Ignore while hidden (modal-root is display:none during a map-pick round trip)
    if (backdrop.getClientRects().length === 0) return;
    close();
  }
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

/**
 * Open the manual-structure wizard.
 * @param {Function} onComplete - called when the user finishes / closes.
 * @param {{ container?: HTMLElement }} [options] - when `container` is given the
 *   wizard mounts inline into it (no modal chrome), for the PlacesPage main pane;
 *   otherwise it opens as a standalone modal. Returns `{ destroy }` either way.
 */
export async function openOrganizeWizard(onComplete, { container } = {}) {
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

  let mergeTS = null;
  function destroyTomSelects() {
    mergeTS?.destroy();
    mergeTS = null;
  }

  // Two mount modes: inline into a host container (PlacesPage main pane) or as a
  // standalone modal. `close` tears down whichever was used.
  let close;
  if (container) {
    container.innerHTML = '';
    container.appendChild(content);
    close = () => {
      destroyTomSelects();
      if (content.parentNode === container) container.removeChild(content);
    };
  } else {
    ({ close } = openModal({
      title: 'Manual structure',
      content,
      onclose: destroyTomSelects,
    }));
  }

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
    // Chain rows: index 0 = immediate parent, higher = broader. A row that
    // matches an existing place terminates the chain (its ancestry follows it).
    const chain = [{ value: '', type: '', existing: null }];

    const typeOptionsHtml = groupTypes(fetchedTypes).map(g =>
      `<optgroup label="${esc(g.label)}">` +
      g.types.map(t => `<option value="${t.key}">${esc(t.label)}</option>`).join('') +
      `</optgroup>`
    ).join('');

    // Only show where this segment appears when that adds information — i.e.
    // it occurs inside longer imported names, not just as a record of its own.
    const distinctExamples = [...new Set(seg.examples)].filter(ex => ex !== seg.name);
    const contextHtml = distinctExamples.length > 0 || seg.count > 1
      ? `<p class="organize-count">Appears in ${seg.count} imported place name${seg.count !== 1 ? 's' : ''}:</p>
         <div class="organize-examples">
           ${(distinctExamples.length > 0 ? distinctExamples : [...new Set(seg.examples)]).map(ex => `<div class="organize-example">${esc(ex)}</div>`).join('')}
         </div>`
      : '';
    content.innerHTML = `
      <p class="organize-intro">
        Use this for places Geocode couldn't find — historic addresses, defunct townlands,
        old farms, or anything Nominatim doesn't know about. Name the place, pick its type,
        and build the chain of places it sits inside — all in this one form. Stop typing
        levels as soon as one matches a place you already have.
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
        ${contextHtml}
        <div class="form-group">
          <label>This place</label>
          <div class="organize-chain-row organize-chain-leaf">
            <input id="org-name" type="text" value="${esc(seg.name)}" autocomplete="off" placeholder="name">
            <select id="org-type">
              <option value="">(type)</option>
              ${typeOptionsHtml}
            </select>
            <span class="organize-chain-spacer" aria-hidden="true"></span>
          </div>
        </div>
        <div class="form-group">
          <label>Inside</label>
          <p class="form-hint organize-chain-hint">Build the chain upward — each level can match an existing place (which ends the chain) or name a new one with its own type.</p>
          <datalist id="org-place-list"></datalist>
          <div id="org-chain"></div>
          <button type="button" class="btn-link btn-sm" id="org-add-level">+ Add broader level</button>
        </div>
        <div class="form-group">
          <div class="organize-coord-head">
            <label>Coordinates (optional)</label>
            <button type="button" class="btn btn-sm" id="org-pick-map">📍 Pick on map</button>
          </div>
          <div class="organize-geo-search">
            <input id="org-geo-query" type="text" autocomplete="off" placeholder="Search for this place">
            <button type="button" class="btn btn-sm btn-primary" id="org-geocode">Search</button>
          </div>
          <ul class="organize-geo-results" id="org-geo-results"></ul>
          <details class="organize-coord-advanced">
            <summary>or enter coordinates manually</summary>
            <div class="organize-coords">
              <input id="org-lat" type="number" step="any" min="-90" max="90" placeholder="Latitude">
              <input id="org-lng" type="number" step="any" min="-180" max="180" placeholder="Longitude">
            </div>
          </details>
          <p class="form-hint" id="org-geo-status"></p>
        </div>
        <div class="organize-actions">
          <button class="btn btn-sm" id="org-skip">Skip</button>
          <button class="btn btn-sm btn-primary" id="org-categorize">Categorize</button>
        </div>
        <div class="organize-merge-section">
          <div class="organize-merge-label">Already have this place? Merge instead</div>
          <p class="form-hint">Point this segment at an existing place — its events move there and no new record is created.</p>
          <div class="organize-select-row">
            <select id="org-merge">
              <option value="">(choose a place)</option>
              ${buildPlaceOptions().map(c => `<option value="${c.id || c.name}" data-name="${c.name}">${c.name}${c.type ? ' (' + c.type.replace(/_/g, ' ') + ')' : ''}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-sm" id="org-merge-btn">Merge</button>
          </div>
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
    mergeTS = new TomSelect(content.querySelector('#org-merge'), tsCommonOpts);

    const placeOptionsList = buildPlaceOptions();
    const idToName = new Map();
    for (const c of placeOptionsList) {
      idToName.set(c.id || c.name, c.name);
    }

    // ── Chain builder (build the "inside" hierarchy in this form) ───────────
    const displayMap = new Map(); // "Name (type)" → { id?, name, type }
    const datalist = content.querySelector('#org-place-list');
    for (const c of placeOptionsList) {
      const display = `${c.name}${c.type ? ' (' + c.type.replace(/_/g, ' ') + ')' : ''}`;
      if (!displayMap.has(display)) {
        displayMap.set(display, c);
        const opt = document.createElement('option');
        opt.value = display;
        datalist.appendChild(opt);
      }
    }

    const chainWrap = content.querySelector('#org-chain');
    const addLevelBtn = content.querySelector('#org-add-level');

    function terminatedIndex() {
      return chain.findIndex(r => r.existing);
    }

    function applyTermination() {
      const term = terminatedIndex();
      Array.from(chainWrap.children).forEach((el, idx) => {
        el.classList.toggle('organize-chain-hidden', term >= 0 && idx > term);
      });
      addLevelBtn.classList.toggle('organize-chain-hidden', term >= 0);
    }

    function buildChainRow(row, idx) {
      const div = document.createElement('div');
      div.className = 'organize-chain-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.setAttribute('list', 'org-place-list');
      input.setAttribute('autocomplete', 'off');
      input.placeholder = idx === 0 ? 'parent — e.g. Drumcondra Rural' : 'broader place';
      input.value = row.value;

      const typeSel = document.createElement('select');
      typeSel.innerHTML = `<option value="">(type)</option>${typeOptionsHtml}`;
      typeSel.value = row.type;
      typeSel.onchange = () => { row.type = typeSel.value; };

      const hint = document.createElement('span');
      hint.className = 'organize-chain-ancestry';

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'organize-chain-remove';
      removeBtn.setAttribute('aria-label', 'Remove level');
      removeBtn.textContent = '×';
      removeBtn.onclick = () => {
        chain.splice(idx, 1);
        if (chain.length === 0) chain.push({ value: '', type: '', existing: null });
        renderChainRows();
      };

      // Update row state without re-rendering (re-render would steal focus mid-typing)
      function syncRow() {
        row.value = input.value;
        row.existing = displayMap.get(input.value.trim()) || null;
        typeSel.classList.toggle('organize-chain-hidden', !!row.existing);
        hint.textContent = '';
        if (row.existing) {
          row.type = '';
          const ex = row.existing;
          const id = ex.id || segmentToPlaceId[ex.name];
          if (id) {
            places.hierarchy(id).then(chainArr => {
              if (row.existing === ex) hint.textContent = '→ ' + chainArr.map(c => c.name).reverse().join(', ');
            });
          } else {
            hint.textContent = 'created this session';
          }
        }
        applyTermination();
      }
      input.addEventListener('input', syncRow);

      div.appendChild(input);
      div.appendChild(typeSel);
      div.appendChild(hint);
      div.appendChild(removeBtn);
      typeSel.classList.toggle('organize-chain-hidden', !!row.existing);
      return div;
    }

    function renderChainRows() {
      chainWrap.innerHTML = '';
      chain.forEach((row, idx) => { chainWrap.appendChild(buildChainRow(row, idx)); });
      applyTermination();
    }

    addLevelBtn.onclick = () => {
      chain.push({ value: '', type: '', existing: null });
      renderChainRows();
      const inputs = chainWrap.querySelectorAll('input');
      inputs[inputs.length - 1]?.focus();
    };

    // Seed the "Inside" chain with the broader levels this segment already sits
    // beside in the flat name(s) — so "16 Southmead Avenue, Newcastle" arrives
    // with "Newcastle" pre-filled. Use the longest such tail across all flat
    // records; the user can trim levels they don't want.
    let seedTail = [];
    for (const p of unorganizedPlaces) {
      const parts = p.name.split(',').map(s => s.trim()).filter(Boolean);
      const idx = parts.indexOf(seg.name);
      if (idx === -1) continue;
      const tail = parts.slice(idx + 1);
      if (tail.length > seedTail.length) seedTail = tail;
    }
    if (seedTail.length > 0) {
      chain.length = 0;
      for (const name of seedTail) {
        // Use an existing organized place's display form when the name matches
        // exactly one — the chain then recognises it as existing (terminates)
        // and carries its ancestry.
        const matches = placeOptionsList.filter(c => c.name === name);
        const value = matches.length === 1
          ? `${matches[0].name}${matches[0].type ? ' (' + matches[0].type.replace(/_/g, ' ') + ')' : ''}`
          : name;
        chain.push({ value, type: '', existing: null });
      }
    }

    renderChainRows();
    // Resolve seeded existing-place matches / ancestry hints without waiting for
    // the user to touch each field.
    chainWrap.querySelectorAll('input').forEach(inp => inp.dispatchEvent(new Event('input')));

    // ── Optional coordinates: search-and-pick (like the Add place form) ─────
    const latInput = content.querySelector('#org-lat');
    const lngInput = content.querySelector('#org-lng');
    const geoStatus = content.querySelector('#org-geo-status');
    const geoBtn = content.querySelector('#org-geocode');
    const geoQuery = content.querySelector('#org-geo-query');
    const geoResults = content.querySelector('#org-geo-results');

    // Pre-fill the search box from the name + seeded chain, so the user rarely
    // has to type anything before hitting Search.
    function composeGeoQuery() {
      const leafName = content.querySelector('#org-name').value.trim();
      const chainNames = chain
        .filter(r => r.value.trim())
        .map(r => r.existing ? r.existing.name : r.value.trim());
      return [leafName, ...chainNames].filter(Boolean).join(', ');
    }
    geoQuery.value = composeGeoQuery();

    async function runGeoSearch() {
      const q = geoQuery.value.trim();
      if (!q) { showToast('Enter a place to search for'); return; }
      geoBtn.disabled = true;
      geoStatus.textContent = 'Searching…';
      geoResults.innerHTML = '';
      try {
        const results = await geocodeSearch(q, { limit: 5 });
        if (results.length === 0) {
          geoStatus.textContent = 'No matches — try a broader search, or enter coordinates by hand.';
          return;
        }
        geoStatus.textContent = '';
        for (const r of results) {
          const li = document.createElement('li');
          li.className = 'organize-geo-result';
          li.textContent = r.display_name;
          li.onclick = () => {
            latInput.value = r.lat;
            lngInput.value = r.lon;
            geoResults.innerHTML = '';
            geoStatus.textContent = `Coordinates set: ${r.display_name}`;
          };
          geoResults.appendChild(li);
        }
      } catch (err) {
        geoStatus.textContent = 'Lookup failed: ' + err.message;
      } finally {
        geoBtn.disabled = false;
      }
    }
    geoBtn.onclick = runGeoSearch;
    geoQuery.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); runGeoSearch(); }
    });

    // Pick on map: App hides #modal-root (this wizard included), switches to the
    // map in pick mode, then restores it and hands back the clicked coordinates.
    // The wizard's DOM — chain rows, typed values — survives untouched.
    content.querySelector('#org-pick-map').onclick = () => {
      emit(PICK_LOCATION, {
        onpick: ({ lat, lng }) => {
          latInput.value = lat.toFixed(6);
          lngInput.value = lng.toFixed(6);
          geoStatus.textContent = `Picked from map: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        },
      });
    };

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

    content.querySelector('#org-skip').onclick = () => {
      currentIndex++;
      saveSkippedSegment(seg.name);
      categorized[seg.name] = { editedName: seg.name, type: '', parentName: null, skipped: true };
      history.push(`${seg.name} — skipped`);
      render();
    };

    content.querySelector('#org-merge-btn').onclick = async () => {
      const mergeValue = mergeTS?.getValue() || '';
      if (!mergeValue) {
        showToast('Choose a place to merge into');
        return;
      }
      const mergeName = idToName.get(mergeValue) || mergeValue;

      // The value is a place ID or a name — try as ID first, then by name
      let targetId = mergeValue;
      if (!Object.values(segmentToPlaceId).includes(targetId)) {
        targetId = segmentToPlaceId[mergeValue] || segmentToPlaceId[mergeName];
      }
      if (!targetId) {
        showToast('Could not find place to merge into');
        return;
      }

      segmentToPlaceId[seg.name] = targetId;
      saveResolvedSegment(seg.name, targetId);
      categorized[seg.name] = { editedName: mergeName, type: '', mergedTo: mergeValue };

      // If this segment IS a whole flat record, actually merge it: repoint its
      // events to the target and delete the flat record (restructureFlatPlaces
      // only handles comma-separated names).
      const sourceRecord = unorganizedPlaces.find(p => p.name.trim() === seg.name && p.id !== targetId);
      if (sourceRecord) {
        const evts = await places.events(sourceRecord.id);
        for (const ev of evts) {
          await events.update(ev.id, { place_id: targetId, place: '' });
        }
        await places.delete(sourceRecord.id);
        new GeocodeQueue(getTreeId()).removeItem(sourceRecord.id);
        emit(DATA_CHANGED);
      }

      await restructureFlatPlaces(seg.name);
      history.push(`${seg.name} → merged to ${mergeName}`);
      showToast(`Merged "${seg.name}" → "${mergeName}"`);
      currentIndex++;
      render();
    };

    content.querySelector('#org-categorize').onclick = async () => {
      // Build the chain (broadest level first), then the leaf
      const editedName = content.querySelector('#org-name').value.trim();
      const type = content.querySelector('#org-type').value;

      if (!editedName) {
        showToast('Name is required');
        return;
      }
      if (!type) {
        showToast('Choose a type — or click Skip if this isn’t a place');
        return;
      }

      // Levels past an existing-place match are ignored (its ancestry follows it)
      const term = terminatedIndex();
      const activeRows = (term >= 0 ? chain.slice(0, term + 1) : chain)
        .filter(r => r.existing || r.value.trim());
      for (const row of activeRows) {
        if (!row.existing && !row.type) {
          showToast(`Choose a type for "${row.value.trim()}" or remove that level`);
          return;
        }
      }

      // Resolve broadest → immediate parent, reusing levels that already exist
      let parentId = null;
      for (let i = activeRows.length - 1; i >= 0; i--) {
        const row = activeRows[i];
        if (row.existing) {
          parentId = row.existing.id || segmentToPlaceId[row.existing.name] || null;
          continue;
        }
        const rowName = row.value.trim();
        const found = await places.findByNameTypeParent(rowName, row.type, parentId);
        const rec = found || await places.create({ name: rowName, type: row.type, parent_id: parentId });
        if (!found) organizedPlaces.push({ id: rec.id, name: rec.name, type: rec.type });
        segmentToPlaceId[rowName] = rec.id;
        saveResolvedSegment(rowName, rec.id);
        parentId = rec.id;
      }

      const coords = {};
      if (latInput.value.trim() !== '' && lngInput.value.trim() !== '') {
        coords.latitude = parseFloat(latInput.value);
        coords.longitude = parseFloat(lngInput.value);
      }

      // Leaf: if this segment IS a whole flat record, update that record in
      // place — its events stay attached. (Creating a copy would strand them
      // on the flat original.)
      const sourceRecord = unorganizedPlaces.find(p => p.name.trim() === seg.name);
      let placeId;
      if (sourceRecord) {
        await places.update(sourceRecord.id, { name: editedName, type, parent_id: parentId, ...coords });
        placeId = sourceRecord.id;
        new GeocodeQueue(getTreeId()).removeItem(placeId);
      } else {
        const existing = await places.search(editedName);
        const match = existing.find(p => p.name === editedName);
        if (match) {
          await places.update(match.id, { type, parent_id: parentId, ...coords });
          placeId = match.id;
        } else {
          const created = await places.create({ name: editedName, type, parent_id: parentId, ...coords });
          placeId = created.id;
        }
      }

      segmentToPlaceId[seg.name] = placeId;
      saveResolvedSegment(seg.name, placeId);
      if (editedName !== seg.name) {
        segmentToPlaceId[editedName] = placeId;
        saveResolvedSegment(editedName, placeId);
      }
      const chainLabel = activeRows
        .map(r => r.existing ? r.existing.name : r.value.trim())
        .join(' → ');
      categorized[seg.name] = { editedName, type, parentName: chainLabel || null };

      // Restructure flat places that contain this segment
      await restructureFlatPlaces(seg.name);

      const parentLabel = chainLabel ? ` → ${chainLabel}` : '';
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

  // Handle so the host (PlacesPage) can tear the wizard down when navigating away.
  return { destroy: close };
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}
