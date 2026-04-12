<script>
  import Modal from '../forms/Modal.svelte';
  import { triggerExport } from '../../gedcom/gedcom.js';
  import { showToast } from '../shared/toast-store.js';
  import { bulk } from '../../db/db.js';

  let { onclose } = $props();

  function exportGedcom() {
    onclose?.();
    triggerExport();
  }

  async function exportSinsear() {
    onclose?.();
    try {
      const bytes = await bulk.exportDatabase();
      const blob = new Blob([bytes], { type: 'application/x-sqlite3' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'familytree.db';
      a.click();
      URL.revokeObjectURL(url);
      showToast('Sinsear backup downloaded');
    } catch (err) {
      showToast('Download failed: ' + err.message);
    }
  }
</script>

<Modal title="Export" onclose={onclose}>
  <p class="export-intro">Choose a format to export to:</p>
  <div class="export-options">
    <button class="export-option" onclick={exportGedcom}>
      <strong>GEDCOM file</strong>
      <span class="export-desc">Standard genealogy format (.ged). Compatible with most family tree software.</span>
    </button>
    <button class="export-option" onclick={exportSinsear}>
      <strong>Sinsear backup</strong>
      <span class="export-desc">Download the full database (.db). Use this to back up or transfer your data.</span>
    </button>
  </div>
</Modal>

<style>
  .export-intro {
    color: var(--text-muted);
    margin-bottom: 16px;
  }
  .export-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .export-option {
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
  .export-option:hover {
    border-color: var(--accent);
  }
  .export-option strong {
    font-size: 14px;
  }
  .export-desc {
    font-size: 13px;
    color: var(--text-muted);
    line-height: 1.4;
  }
</style>
