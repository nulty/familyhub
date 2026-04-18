<script>
  import { placeTypes } from '../../db/db.js';
  import { showToast } from '../shared/toast-store.js';

  let { onClose } = $props();

  let types = $state([]);
  let newKey = $state('');
  let newLabel = $state('');

  async function load() {
    types = await placeTypes.list();
  }

  $effect(() => { load(); });

  async function renameLabel(key, label) {
    if (!label.trim()) {
      showToast('Label cannot be empty');
      await load();
      return;
    }
    await placeTypes.updateLabel(key, label.trim());
    showToast(`Renamed "${key}" to "${label.trim()}"`);
  }

  async function addType() {
    const key = newKey.trim().toLowerCase().replace(/\s+/g, '_');
    const label = newLabel.trim();
    if (!key || !label) return;
    try {
      await placeTypes.create({ key, label });
      newKey = '';
      newLabel = '';
      await load();
      showToast('Type added');
    } catch (err) {
      showToast('Error: ' + err.message);
    }
  }

  async function removeType(key) {
    try {
      await placeTypes.delete(key);
      await load();
      showToast('Type removed');
    } catch (err) {
      showToast(err.message);
    }
  }
</script>

<div class="type-settings">
  <div class="settings-header">
    <h3>Place types</h3>
    <button class="btn btn-sm" onclick={onClose}>Close</button>
  </div>

  <table class="type-table">
    <thead>
      <tr><th>Key</th><th>Label</th><th>Source</th><th></th></tr>
    </thead>
    <tbody>
      {#each types as t (t.key)}
        <tr>
          <td><code>{t.key}</code></td>
          <td>
            <input
              type="text"
              value={t.label}
              onchange={(e) => renameLabel(t.key, e.target.value)}
            />
          </td>
          <td><span class="source-badge source-{t.source}">{t.source}</span></td>
          <td>
            {#if t.source === 'custom'}
              <button class="btn-link btn-sm danger" onclick={() => removeType(t.key)}>Delete</button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="add-type">
    <input type="text" bind:value={newKey} placeholder="Key (e.g. poor_law_union)" />
    <input type="text" bind:value={newLabel} placeholder="Label (e.g. Poor Law Union)" />
    <button class="btn btn-sm btn-primary" onclick={addType} disabled={!newKey.trim() || !newLabel.trim()}>Add</button>
  </div>

  <p class="hint">Built-in Nominatim types can be relabelled but not deleted (decomposition depends on them). Add your own types for region-specific concepts (e.g. civil parish, townland, barony).</p>
</div>

<style>
  .type-settings {
    border: 1px solid var(--border-color, #ddd);
    border-radius: 6px;
    padding: 12px;
    margin-top: 12px;
    background: var(--bg-elevated, #fafafa);
  }
  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .settings-header h3 { margin: 0; font-size: 1rem; }
  .type-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  .type-table th,
  .type-table td {
    padding: 4px 6px;
    text-align: left;
    border-bottom: 1px solid var(--border-color, #eee);
  }
  .type-table th { font-weight: 500; color: var(--text-muted, #666); }
  .type-table input {
    width: 100%;
    border: 1px solid transparent;
    padding: 2px 6px;
    background: transparent;
    font-size: 0.85rem;
  }
  .type-table input:focus {
    border-color: var(--accent-color, #3498db);
    background: #fff;
    outline: none;
  }
  .source-badge {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 10px;
    font-size: 0.7rem;
    background: var(--bg, #eee);
    color: var(--text-muted, #666);
  }
  .source-custom { background: #e8f4ff; color: #1a6dba; }
  .add-type {
    display: flex;
    gap: 6px;
    margin-top: 12px;
  }
  .add-type input {
    flex: 1;
    padding: 4px 8px;
    font-size: 0.85rem;
  }
  .danger { color: var(--danger, #e74c3c); }
  .hint {
    margin-top: 12px;
    font-size: 0.8rem;
    color: var(--text-muted, #666);
    line-height: 1.4;
  }
</style>
