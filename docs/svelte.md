# Svelte 5 Migration Plan

## Context

The FamilyHub codebase is ~2,650 lines of vanilla JS UI code across 19 files, with ~1,370 lines of CSS in a single file. There's no framework, which means every component manually creates DOM, wires event listeners, and manages its own state. As the app grows, this leads to duplicated utilities (e.g. `esc()` in 8 files), leaked global listeners, and complex manual re-rendering (e.g. the event form's participant/citation arrays).

Migrating to Svelte 5 gives us: scoped CSS, declarative reactivity, component lifecycle cleanup, and a standard component model — while keeping the "compiles to vanilla JS" philosophy (near-zero runtime).

**Approach:** Incremental migration with compatibility bridges. The app works at every step. Vanilla JS modules and Svelte components coexist during migration.

**Decisions:**
- Svelte 5 with runes (`$state`, `$props`, `$derived`, `$effect`)
- Svelte stores replace the event bus (with a bidirectional bridge during migration)
- CSS moves into component `<style>` blocks; global styles remain in a slimmed `src/styles.css`

## What Stays Unchanged

These are framework-agnostic and need no modification:

- `src/db/db.js`, `src/db/handlers.js` — DB API facade and SQL handlers
- `public/worker.js`, `public/schema.sql` — SQLite worker and schema
- `src/util/ulid.js`, `src/util/dates.js` — utilities
- `src/gedcom/import.js`, `src/gedcom/export.js` — GEDCOM parsing/serialization
- `src/config.js` — localStorage wrapper
- `tests/` — all tests (they test SQL handlers, not UI)
- `public/coi-serviceworker.js` — COOP/COEP for GitHub Pages

## Directory Structure (target)

```
src/
  main.js                    # New entry point: initDB + mount App.svelte
  styles.css                 # Slimmed to global-only (reset, vars, family-chart)
  db/                        # Unchanged
  util/                      # Unchanged (minor: placeTypeOptions data-only)
  gedcom/                    # import.js + export.js unchanged; gedcom.js → component
  config.js                  # Unchanged
  lib/
    stores/
      app.js                 # Svelte stores + bridge to state.js during migration
    components/
      App.svelte
      Header.svelte
      Search.svelte
      EmptyState.svelte
      TreeView.svelte
      TreeConfig.svelte
      Panel.svelte           # May decompose into sub-components
      PlacesPage.svelte
      PlacesOrganize.svelte
      SourcesPage.svelte
      GedcomImport.svelte
    forms/
      Modal.svelte
      PersonForm.svelte
      EventForm.svelte
      RelationshipForm.svelte
      PlaceForm.svelte
      RepositoryForm.svelte
      SourceForm.svelte
      CitationForm.svelte
    pickers/
      PersonPicker.svelte
      PlacePicker.svelte
      SourcePicker.svelte
    shared/
      Toast.svelte
```

---

## Phase 0: Tooling Setup

**Goal:** Svelte compiles, existing app unchanged.

1. `npm install --save-dev svelte @sveltejs/vite-plugin-svelte`
2. Update `vite.config.js` — add `svelte()` plugin (before cross-origin isolation plugin)
3. Create `svelte.config.js` (minimal, no TS)
4. Create `src/lib/stores/app.js` — Svelte stores with bidirectional bridge to `state.js`:
   - `selectedPersonId` writable (bridges PERSON_SELECTED / PERSON_DESELECTED)
   - `dataVersion` writable (bridges DATA_CHANGED, increments on each change)
   - `hasData` derived (bridges DB_POPULATED)
   - `modalStack` writable (array of `{ component, props }` for declarative modals)
5. Create a smoke-test `src/lib/components/App.svelte` (not yet wired in)
6. Verify: `npm run dev`, `npm run build`, `npm test` all pass

**Files:** `package.json`, `vite.config.js`, new `svelte.config.js`, new `src/lib/stores/app.js`

---

## Phase 1: Toast + Modal

**Goal:** Replace the two foundation UI primitives all other components depend on.

### Toast.svelte
- `toasts` store (array of `{ id, message }`)
- Export `showToast(message, duration)` — pushes to store, auto-removes after timeout
- Renders `{#each}` with Svelte transitions
- Temporarily mount standalone into `#toast-root` via `main.js`
- Re-export `showToast` from old `src/ui/toast.js` path so existing imports work

### Modal.svelte
- Props via `$props()`: `title`, `wide`, `onclose`
- `{@render children()}` snippet for body content
- Handles: backdrop click, Escape key, close button
- Appends to `#modal-root` (Svelte 5 `mount()` with `target`)
- During migration: old imperative `openModal()` coexists (both append to `#modal-root`)
- Export an `openSvelteModal(component, props)` helper that pushes to `modalStack` store

**Files:** `src/lib/shared/Toast.svelte`, `src/lib/forms/Modal.svelte`, update `src/ui/toast.js` (re-export bridge)

---

## Phase 2: Pickers

**Goal:** Convert the 3 nearly-identical picker components. These are leaves used by forms.

### Pattern (same for all three)
- Props: `onselect`, `excludeIds`, `value` (pre-fill)
- Internal state: `let query = $state('')`, `let results = $state([])`, `let open = $state(false)`
- Debounced search via `$effect`
- "Create new" dispatches to parent (avoids circular imports — parent opens the form)
- `use:clickoutside` action for closing

### Compatibility bridge
Each exports a `createXPicker({ onSelect, excludeIds })` wrapper that mounts the Svelte component onto a returned HTMLElement — matching the old factory API for unconverted forms.

**Files:** `src/lib/pickers/PersonPicker.svelte`, `PlacePicker.svelte`, `SourcePicker.svelte` + bridge wrappers in old `src/forms/` paths

---

## Phase 3: Simple Forms

**Goal:** Convert 4 simple forms. Order by dependency (fewest deps first).

1. **PersonForm.svelte** (94 lines) — no pickers, just fields
2. **RepositoryForm.svelte** (113 lines) — no pickers
3. **PlaceForm.svelte** (121 lines) — uses PlacePicker
4. **RelationshipForm.svelte** (71 lines) — uses PersonPicker

### Pattern
- Props: `entityId?`, `oncomplete?`, `prefill?`
- Load existing data in `$effect` if editing
- Submit → `db.*.create/update()` → `dataVersion.update()` → `showToast()` → `oncomplete?.()`
- Wrapped in `<Modal>`

### Compatibility bridge
Each exports `openXForm(id?, callback?)` that mounts the component in a modal — matching old imperative API.

### Minor refactor
`src/util/place-types.js`: Change `placeTypeOptions()` to return `[{ value, label }]` data array instead of HTML strings. The old HTML-returning version can stay as a separate export during migration.

**Files:** 4 new `.svelte` files, bridge wrappers, `place-types.js` update

---

## Phase 4: Complex Forms

1. **SourceForm.svelte** (181 lines) — inline repository autocomplete
2. **CitationForm.svelte** (173 lines) — uses SourcePicker
3. **EventForm.svelte** (361 lines) — the hardest single conversion
   - Place input → use PlacePicker component
   - Participants → `let participants = $state([])` with `{#each}` + PersonPicker
   - Citations → `let citations = $state([])` with `{#each}` + SourcePicker
   - Svelte reactivity replaces manual `renderParticipants()` / `renderCitations()`

**Files:** 3 new `.svelte` files + bridge wrappers

---

## Phase 5: Panel + Search

### Search.svelte (68 lines)
- Debounced search, dropdown results
- Updates `selectedPersonId` store on select
- Calls `focusPerson()` (imported from TreeView — exposed via store or module)

### Panel.svelte (245 lines)
- Reactive to `$selectedPersonId` and `$dataVersion`
- May decompose: `PanelEvents.svelte`, `PanelRelationships.svelte`
- Direct `onclick` handlers replace event delegation
- Navigation updates `selectedPersonId` store

**Files:** `Search.svelte`, `Panel.svelte` (+ optional sub-components)

---

## Phase 6: Management Pages

1. **SourcesPage.svelte** (225 lines) — repos + sources list in modal
2. **PlacesPage.svelte** (271 lines) — recursive tree (use `<svelte:self>` for recursion)
3. **PlacesOrganize.svelte** (415 lines) — wizard with step state machine

**Files:** 3 new `.svelte` files

---

## Phase 7: TreeView + TreeConfig

### TreeView.svelte
- `bind:this={container}` on chart div
- `onMount()`: create family-chart instance
- React to `$dataVersion` to refresh
- Expose `focusPerson()` via a module-level export or `focusPersonId` store
- `formatData()`, `cardHtmlCreator()` move into script block as-is
- Card click → update `selectedPersonId` store

### TreeConfig.svelte
- Settings drawer with two-way bound inputs (`bind:value`)
- Reactive `$effect` applies colors/layout on change
- Reads/writes config via `config.js`

**Files:** `TreeView.svelte`, `TreeConfig.svelte`

---

## Phase 8: App Shell + GEDCOM

### App.svelte
- Replaces `index.html` shell + `app.js` boot logic
- Renders Header, TreeView/EmptyState, Panel, ModalStack, Toast
- Reactive to `$hasData`, `$selectedPersonId`

### Header.svelte
- Logo, search, action buttons (sources, places, settings, add, import/export)

### GedcomImport.svelte
- File picker + confirmation modal
- Uses unchanged `parseGEDCOM()` / `exportGEDCOM()`

### src/main.js (new entry point)
```js
import { initDB } from './db/db.js';
import { mount } from 'svelte';
import App from './lib/components/App.svelte';

await initDB();
mount(App, { target: document.getElementById('app') });
```

### index.html
Strip to minimal shell: `<div id="app"></div>` + script tag.

**Files:** `App.svelte`, `Header.svelte`, `EmptyState.svelte`, `GedcomImport.svelte`, `src/main.js`, `index.html`

---

## Phase 9: Cleanup

1. Delete `src/ui/` (all vanilla UI modules)
2. Delete `src/forms/` (all vanilla form modules)
3. Delete `src/state.js` (event bus — stores now handle everything)
4. Delete `src/app.js` (replaced by main.js + App.svelte)
5. Remove bridge code from stores (no more vanilla consumers)
6. Remove compatibility wrapper functions from pickers/forms
7. Slim `src/styles.css` to global-only (reset, CSS vars, family-chart overrides, responsive)
8. Delete dead CSS that moved into `<style>` blocks
9. Update `CLAUDE.md` to reflect new architecture

---

## Verification

After each phase:
- `npm run dev` — app loads, existing features work
- `npm run build` — production build succeeds
- `npm test` — all handler tests pass (unaffected by UI changes)
- Manual: create/edit/delete a person, check tree updates, panel renders, modals open/close

After Phase 9 (final):
- Full manual walkthrough: CRUD people/events/places/sources, GEDCOM import/export, tree config, search
- Verify no console errors
- Verify OPFS persistence (reload retains data)
- `npm run build && npm run preview` — production build works with COOP/COEP headers
