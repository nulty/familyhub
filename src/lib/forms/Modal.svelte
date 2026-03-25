<script>
  let { title = '', wide = false, onclose, children } = $props();

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onclose?.();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') onclose?.();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick}>
  <div class="modal" class:modal-wide={wide}>
    <div class="modal-header">
      <h2>{title}</h2>
      <button class="modal-close" aria-label="Close" onclick={() => onclose?.()}>&times;</button>
    </div>
    <div class="modal-body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--bg-panel);
    border-radius: 10px;
    box-shadow: 0 8px 30px rgba(0,0,0,.15);
    width: 90%;
    max-width: 480px;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal.modal-wide {
    max-width: 720px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    flex: 1;
    font-size: 16px;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 22px;
    cursor: pointer;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .modal-close:hover { color: var(--text); }

  .modal-body {
    padding: 18px;
    overflow-y: auto;
    flex: 1;
  }

  @media (max-width: 768px) {
    .modal {
      width: 100%;
      max-width: 100%;
      max-height: 100vh;
      border-radius: 0;
      height: 100%;
    }

    .modal-backdrop {
      align-items: stretch;
    }
  }
</style>
