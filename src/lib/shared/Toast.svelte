<script>
  import { toasts } from './toast-store.js';
</script>

{#each $toasts as toast (toast.id)}
  <div class="toast toast-visible">{toast.message}</div>
{/each}

<style>
  .toast {
    background: var(--text);
    color: #fff;
    padding: 8px 20px;
    border-radius: 999px;
    font-size: 13px;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity .2s, transform .2s;
    pointer-events: auto;
  }

  .toast-visible {
    opacity: 1;
    transform: translateY(0);
  }
</style>
