<script>
  let { title, message, confirmLabel = 'Confirm', danger = false, onresult, onclose } = $props();

  function done(result) {
    onresult?.(result);
    onclose?.();
  }
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') done(false); }} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) done(false); }}>
  <div class="modal confirm-modal">
    <div class="modal-header">
      <h2>{title}</h2>
      <button class="modal-close" aria-label="Close" onclick={() => done(false)}>&times;</button>
    </div>
    <div class="modal-body">
      <p class="confirm-message">{message}</p>
      <div class="form-actions">
        <button class="btn" onclick={() => done(false)}>Cancel</button>
        <button class="btn" class:btn-danger={danger} class:btn-primary={!danger} onclick={() => done(true)}>{confirmLabel}</button>
      </div>
    </div>
  </div>
</div>

<style>
  .confirm-message {
    white-space: pre-line;
    line-height: 1.5;
    margin-bottom: 18px;
    font-size: 14px;
  }
  .btn-danger {
    background: var(--danger);
    color: white;
    border-color: var(--danger);
  }
  .btn-danger:hover {
    background: var(--danger-hover);
    border-color: var(--danger-hover);
  }
</style>
