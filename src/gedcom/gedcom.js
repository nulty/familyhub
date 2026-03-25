/**
 * gedcom.js — GEDCOM import/export UI
 */

import { bulk, nukeDatabase } from '../db/db.js';
import { setConfig } from '../config.js';
import { emit, DATA_CHANGED, DB_POPULATED } from '../state.js';
import { parseGEDCOM } from './import.js';
import { exportGEDCOM } from './export.js';
import { openModal } from '../ui/modal.js';
import { showToast } from '../ui/toast.js';

export function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ged,.gedcom';

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const text = await file.text();
    const { data, warnings, stats } = parseGEDCOM(text);

    const content = document.createElement('div');
    content.innerHTML = `
      <p>Ready to import <strong>${file.name}</strong>:</p>
      <dl class="import-stats">
        <dt>People:</dt><dd>${stats.people}</dd>
        <dt>Relationships:</dt><dd>${stats.relationships}</dd>
        <dt>Events:</dt><dd>${stats.events}</dd>
        <dt>Sources:</dt><dd>${stats.sources}</dd>
      </dl>
      ${warnings.length ? `<div class="import-warnings"><strong>Warnings:</strong><ul>${warnings.map(w => `<li>${w}</li>`).join('')}</ul></div>` : ''}
      <div class="form-actions">
        <button class="btn" data-action="cancel">Cancel</button>
        <button class="btn btn-danger" data-action="reset-import">Reset & Import</button>
        <button class="btn btn-primary" data-action="confirm">Import</button>
      </div>
    `;

    const { close } = openModal({ title: 'Import GEDCOM', content });

    content.querySelector('[data-action="cancel"]').onclick = close;

    async function doImport(reset) {
      try {
        if (reset) {
          if (!confirm('This will delete ALL existing data and recreate the database. Continue?')) return;
          await nukeDatabase();
          setConfig('resolvedPlaceSegments', {});
          setConfig('skippedPlaceSegments', []);
        }
        const counts = await bulk.import(data);
        close();
        emit(DATA_CHANGED);
        showToast(`Imported ${counts.people} people, ${counts.events} events`);
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    }

    content.querySelector('[data-action="confirm"]').onclick = () => doImport(false);
    content.querySelector('[data-action="reset-import"]').onclick = () => doImport(true);
  };

  input.click();
}

export async function triggerExport() {
  try {
    const data = await bulk.exportAll();
    const gedText = exportGEDCOM(data);
    const blob = new Blob([gedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree.ged';
    a.click();
    URL.revokeObjectURL(url);
    showToast('GEDCOM exported');
  } catch (err) {
    showToast('Export failed: ' + err.message);
  }
}
