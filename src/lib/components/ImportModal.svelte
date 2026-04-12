<script>
  import Modal from '../forms/Modal.svelte';
  import { triggerImport } from '../../gedcom/gedcom.js';
  import { showToast } from '../shared/toast-store.js';
  import { bulk } from '../../db/db.js';
  import { emit, DATA_CHANGED, PERSON_DESELECTED } from '../../state.js';

  let { onclose, onuploadstatus, onmigration } = $props();

  function importGedcom() {
    onclose?.();
    triggerImport();
  }

  function importSinsear() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db,.sqlite,.sqlite3';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      if (!confirm(`Replace the current database with "${file.name}"? This cannot be undone.`)) return;
      onclose?.();
      try {
        onuploadstatus?.('Reading file\u2026');
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        onuploadstatus?.('Restoring database\u2026');
        const result = await bulk.importDatabase(bytes);
        if (result.pendingMigrations?.length > 0) {
          onuploadstatus?.(null);
          onmigration?.(result.pendingMigrations);
          return;
        }
        emit(PERSON_DESELECTED);
        emit(DATA_CHANGED);
        showToast('Database restored from ' + file.name);
      } catch (err) {
        showToast('Upload failed: ' + err.message);
      } finally {
        onuploadstatus?.(null);
      }
    };
    input.click();
  }
</script>

<Modal title="Import" onclose={onclose}>
  <p class="import-intro">Choose a format to import from:</p>
  <div class="import-options">
    <button class="import-option" onclick={importGedcom}>
      <strong>GEDCOM file</strong>
      <span class="import-desc">Standard genealogy format (.ged). Works with most family tree software.</span>
    </button>
    <button class="import-option" onclick={importSinsear}>
      <strong>Sinsear backup</strong>
      <span class="import-desc">Restore from a previously downloaded Sinsear database file (.db).</span>
    </button>
  </div>
</Modal>

<style>
  .import-intro {
    color: var(--text-muted);
    margin-bottom: 16px;
  }
  .import-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .import-option {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 14px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.15s;
  }
  .import-option:hover {
    border-color: var(--accent);
  }
  .import-option strong {
    font-size: 14px;
  }
  .import-desc {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
