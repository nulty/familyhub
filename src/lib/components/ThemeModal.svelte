<script>
  import Modal from '../forms/Modal.svelte';
  import { THEMES, getTheme, setTheme } from '../../theme.js';

  let { onclose } = $props();

  let current = $state(getTheme());

  function choose(id) {
    current = id;
    setTheme(id);
  }
</script>

<Modal title="Theme" onclose={onclose}>
  <p class="theme-intro">Choose how Sinsear looks. Your choice is saved on this device.</p>
  <div class="theme-options" role="radiogroup" aria-label="Theme">
    {#each THEMES as theme (theme.id)}
      <label class="theme-option" class:selected={current === theme.id}>
        <input
          type="radio"
          name="theme"
          value={theme.id}
          checked={current === theme.id}
          onchange={() => choose(theme.id)}
        />
        <span class="theme-option-text">
          <strong>{theme.label}</strong>
          <span class="theme-option-desc">{theme.description}</span>
        </span>
      </label>
    {/each}
  </div>
  <div class="form-actions">
    <button class="btn btn-primary" onclick={() => onclose?.()}>Done</button>
  </div>
</Modal>

<style>
  .theme-intro {
    font-size: var(--text-base);
    color: var(--text-muted);
    margin-bottom: 12px;
  }
  .theme-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 14px;
  }
  .theme-option {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-ctl);
    cursor: pointer;
  }
  .theme-option:hover { background: var(--surface-sunken); }
  .theme-option.selected {
    border-color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  .theme-option input { margin-top: 2px; accent-color: var(--accent); }
  .theme-option-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .theme-option-text strong { font-size: var(--text-base); }
  .theme-option-desc {
    font-size: var(--text-sm);
    color: var(--text-muted);
  }
</style>
