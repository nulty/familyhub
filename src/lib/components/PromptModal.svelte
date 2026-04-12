<script>
  let { title, message = '', placeholder = '', confirm = 'OK', onresult, onclose } = $props();

  let value = $state('');
  let inputEl;

  function done(result) {
    onresult?.(result);
    onclose?.();
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (value.trim()) done(value.trim());
  }

  $effect(() => {
    // Auto-focus the input after mount
    setTimeout(() => inputEl?.focus(), 0);
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') done(null); }} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={(e) => { if (e.target === e.currentTarget) done(null); }}>
  <div class="modal">
    <div class="modal-header">
      <h2>{title}</h2>
      <button class="modal-close" aria-label="Close" onclick={() => done(null)}>&times;</button>
    </div>
    <div class="modal-body">
      {#if message}
        <p class="prompt-message">{message}</p>
      {/if}
      <form onsubmit={handleSubmit}>
        <input
          bind:this={inputEl}
          bind:value
          class="prompt-input"
          type="text"
          placeholder={placeholder}
        />
        <div class="form-actions">
          <button type="button" class="btn" onclick={() => done(null)}>Cancel</button>
          <button type="submit" class="btn btn-primary" disabled={!value.trim()}>{confirm}</button>
        </div>
      </form>
    </div>
  </div>
</div>

<style>
  .prompt-message {
    color: var(--text-muted);
    line-height: 1.5;
    margin-bottom: 12px;
    font-size: 14px;
  }
  .prompt-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-size: 14px;
    margin-bottom: 16px;
    outline: none;
    transition: border-color 0.15s;
  }
  .prompt-input:focus {
    border-color: var(--accent);
  }
</style>
