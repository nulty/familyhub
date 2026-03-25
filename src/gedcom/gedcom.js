/**
 * gedcom.js — GEDCOM import/export UI
 */

import { bulk } from '../db/db.js';
import { parseGEDCOM } from './import.js';
import { exportGEDCOM } from './export.js';
import { showToast } from '../ui/toast.js';
import { mount, unmount } from 'svelte';
import GedcomImport from '../lib/components/GedcomImport.svelte';

export function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ged,.gedcom';

  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;

    const text = await file.text();
    const { data, warnings, stats } = parseGEDCOM(text);

    const target = document.getElementById('modal-root');
    const container = document.createElement('div');
    target.appendChild(container);

    let component;

    function close() {
      if (component) unmount(component);
      container.remove();
    }

    component = mount(GedcomImport, {
      target: container,
      props: {
        filename: file.name,
        data,
        stats,
        warnings,
        onclose: close,
      },
    });
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
