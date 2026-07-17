<script>
  import { bulk, resetDatabase } from '../../db/db.js';
  import { setConfig, getTreeId } from '../../config.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import { GeocodeQueue } from '../../util/geocode-queue.js';
  import Modal from '../forms/Modal.svelte';
  import { showConfirm } from '../shared/confirm.js';
  import { openPlacesPage } from '../shared/open.js';

  let { filename, data, stats, warnings, onclose } = $props();

  async function doImport(reset) {
    try {
      const queue = new GeocodeQueue(getTreeId());
      if (reset) {
        if (!await showConfirm({ title: 'Replace all data?', message: 'This will delete ALL existing data and recreate the database.', confirm: 'Replace', danger: true })) return;
        await resetDatabase();
        queue.clear();
        setConfig('resolvedPlaceSegments', {});
        setConfig('skippedPlaceSegments', []);
      }
      const snapshot = $state.snapshot(data);
      const counts = await bulk.import(snapshot);
      // Imported places arrive flat (no type/parent/coords) and invisible to
      // search — feed them straight into the geocode funnel.
      const queued = queue.addPendingPlaces(snapshot.places || []);
      onclose?.();
      emit(DATA_CHANGED);
      const summary = `Imported ${counts.people} people, ${counts.events} events`;
      if (queued > 0) {
        showToast(summary);
        // Handoff into the places funnel — imported places are unsearchable
        // and unmapped until geocoded.
        const organize = await showConfirm({
          title: 'Import complete',
          message: `${queued} place${queued === 1 ? ' was' : 's were'} imported unorganized and queued for geocoding.\nThey won't appear in place searches or on the map until they're processed.`,
          confirm: 'Organize places',
          cancel: 'Later',
        });
        if (organize) openPlacesPage();
      } else {
        showToast(summary);
      }
    } catch (err) {
      showToast('Import failed: ' + err.message);
    }
  }
</script>

<Modal title="Import GEDCOM" onclose={onclose}>
  <p>Ready to import <strong>{filename}</strong>:</p>
  <dl class="import-stats">
    <dt>People:</dt><dd>{stats.people}</dd>
    <dt>Relationships:</dt><dd>{stats.relationships}</dd>
    <dt>Events:</dt><dd>{stats.events}</dd>
    <dt>Repositories:</dt><dd>{stats.repositories}</dd>
    <dt>Sources:</dt><dd>{stats.sources}</dd>
    <dt>Citations:</dt><dd>{stats.citations}</dd>
    <dt>Places:</dt><dd>{stats.places}{stats.placeVariantsMerged > 0 ? ` (${stats.placeVariantsMerged} variant${stats.placeVariantsMerged === 1 ? '' : 's'} merged)` : ''}</dd>
  </dl>
  {#if warnings.length > 0}
    <div class="import-warnings">
      <strong>Warnings:</strong>
      <ul>
        {#each warnings as w}
          <li>{w}</li>
        {/each}
      </ul>
    </div>
  {/if}
  <div class="form-actions">
    <button class="btn" onclick={() => onclose?.()}>Cancel</button>
    <button class="btn btn-danger" onclick={() => doImport(true)}>Reset & Import</button>
    <button class="btn btn-primary" onclick={() => doImport(false)}>Import</button>
  </div>
</Modal>
