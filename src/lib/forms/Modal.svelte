<script>
  let { title = '', wide = false, xwide = false, onclose, children } = $props();

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
  <div class="modal" class:modal-wide={wide} class:modal-xwide={xwide}>
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
    background: var(--backdrop);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: var(--surface-raised);
    border-radius: 10px;
    box-shadow: var(--shadow-modal);
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

  .modal.modal-xwide {
    max-width: 940px;
  }

  /* Management pages (xwide) hold a fixed height on desktop so swapping their
     inner views never collapses/regrows the whole modal around its centre.
     Inner content scrolls via .modal-body. Mobile keeps the full-screen rule. */
  @media (min-width: 769px) {
    .modal.modal-xwide {
      height: 85vh;
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    flex: 1;
    font-size: var(--text-xl);
    font-weight: var(--weight-semibold);
  }

  .modal-close {
    background: none;
    border: none;
    font-size: var(--text-4xl);
    cursor: pointer;
    color: var(--text-muted);
    padding: 0 4px;
  }

  .modal-close:hover { color: var(--text-primary); }

  .modal-body {
    padding: 18px;
    overflow-y: auto;
    /* Reserve the scrollbar gutter so swapping between tall (scrolling) and
       short (non-scrolling) content doesn't shift the layout horizontally. */
    scrollbar-gutter: stable;
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
