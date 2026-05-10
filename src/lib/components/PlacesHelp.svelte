<script>
  import Modal from '../forms/Modal.svelte';
  import guideMd from '../../../docs/places-user-guide.md?raw';

  let { onclose } = $props();

  let html = $state('');
  let toc = $state([]);
  let bodyEl;

  $effect(() => {
    let cancelled = false;
    import('marked').then(({ marked }) => {
      if (cancelled) return;
      const rendered = marked.parse(guideMd, { mangle: false, headerIds: true });
      html = rendered;
      // Build a TOC from h2s after the HTML is in the DOM
      requestAnimationFrame(() => {
        if (!bodyEl) return;
        const h2s = bodyEl.querySelectorAll('h2');
        toc = Array.from(h2s).map((h, i) => {
          if (!h.id) h.id = `help-h2-${i}`;
          return { id: h.id, text: h.textContent };
        });
      });
    });
    return () => { cancelled = true; };
  });

  function jumpTo(id) {
    const el = bodyEl?.querySelector('#' + CSS.escape(id));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<Modal title="Places guide" wide={true} onclose={onclose}>
  <div class="help-layout">
    {#if toc.length > 0}
      <nav class="help-toc" aria-label="Table of contents">
        <h4>On this page</h4>
        <ul>
          {#each toc as entry (entry.id)}
            <li>
              <button type="button" class="help-toc-link" onclick={() => jumpTo(entry.id)}>{entry.text}</button>
            </li>
          {/each}
        </ul>
      </nav>
    {/if}
    <div class="help-prose" bind:this={bodyEl}>
      {#if !html}
        <p class="help-loading">Loading guide…</p>
      {:else}
        {@html html}
      {/if}
    </div>
  </div>
</Modal>

<style>
  .help-layout {
    display: grid;
    grid-template-columns: 200px 1fr;
    gap: 20px;
    align-items: start;
  }

  .help-toc {
    position: sticky;
    top: 0;
    max-height: calc(85vh - 80px);
    overflow-y: auto;
    padding-right: 4px;
    border-right: 1px solid var(--border-color, #eee);
  }
  .help-toc h4 {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #888);
    margin: 0 0 6px;
  }
  .help-toc ul { list-style: none; padding: 0; margin: 0; }
  .help-toc li { margin: 0; }
  .help-toc-link {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text, #333);
    line-height: 1.3;
  }
  .help-toc-link:hover { color: var(--accent-color, #3498db); }

  .help-loading { color: var(--text-muted, #888); }

  @media (max-width: 640px) {
    .help-layout { grid-template-columns: 1fr; }
    .help-toc {
      position: static;
      max-height: none;
      border-right: none;
      border-bottom: 1px solid var(--border-color, #eee);
      padding-bottom: 8px;
      margin-bottom: 8px;
    }
  }
</style>
