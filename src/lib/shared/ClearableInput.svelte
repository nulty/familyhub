<script>
  let {
    value = $bindable(''),
    placeholder = '',
    type = 'text',
    ariaLabel = '',
    onchange,
    oninput,
    onkeydown,
    id = '',
    class: className = '',
  } = $props();

  function clear() {
    value = '';
    oninput?.({ target: { value: '' } });
    onchange?.({ target: { value: '' } });
  }
</script>

<span class="clearable-input {className}">
  <input
    {type}
    {placeholder}
    {id}
    aria-label={ariaLabel || placeholder}
    bind:value
    {onchange}
    {oninput}
    {onkeydown}
  />
  {#if value}
    <button
      type="button"
      class="clear-btn"
      onclick={clear}
      tabindex="-1"
      aria-label="Clear"
    >×</button>
  {/if}
</span>

<style>
  .clearable-input {
    position: relative;
    display: inline-flex;
    align-items: center;
    flex: 1;
    min-width: 0;
  }
  /* Match the standard form input so ClearableInput looks right outside a
     .form-group too (Merge/geocode filters, etc.). */
  .clearable-input input {
    flex: 1;
    min-width: 0;
    padding: 7px 10px;
    padding-right: 26px;
    border: 1px solid var(--border);
    border-radius: var(--radius-ctl);
    font-size: var(--text-md);
    font-family: inherit;
  }
  .clearable-input input:focus {
    border-color: var(--accent);
  }
  .clear-btn {
    position: absolute;
    right: 4px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    cursor: pointer;
    color: var(--text-muted);
    font-size: var(--text-2xl);
    line-height: 1;
    padding: 2px 6px;
    border-radius: 50%;
  }
  .clear-btn:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
  }
</style>
