<script>
  import { bulk, resetDatabase } from '../../db/db.js';
  import { setConfig } from '../../config.js';
  import { emit, DATA_CHANGED } from '../../state.js';
  import { showToast } from '../shared/toast-store.js';
  import Modal from '../forms/Modal.svelte';

  let { filename, data, stats, warnings, onclose } = $props();

  async function doImport(reset) {
    try {
      if (reset) {
        if (!confirm('This will delete ALL existing data and recreate the database. Continue?')) return;
        await resetDatabase();
        setConfig('resolvedPlaceSegments', {});
        setConfig('skippedPlaceSegments', []);
      }
      const counts = await bulk.import($state.snapshot(data));
      onclose?.();
      emit(DATA_CHANGED);
      showToast(`Imported ${counts.people} people, ${counts.events} events`);
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
