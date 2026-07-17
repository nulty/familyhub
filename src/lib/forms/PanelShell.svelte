<script>
  // Renders its children either as a standalone Modal (default) or, when
  // `embedded` is true, as a bare panel — so the same tool component can be a
  // pop-up modal or live inside the PlacesPage main pane. The embedded header
  // (title + back) is owned by the host page, so embedded mode is a passthrough.
  import Modal from './Modal.svelte';

  let { title = '', wide = false, embedded = false, onclose, children } = $props();
</script>

{#if embedded}
  <div class="panel-embedded">
    {@render children()}
  </div>
{:else}
  <Modal {title} {wide} {onclose}>
    {@render children()}
  </Modal>
{/if}
